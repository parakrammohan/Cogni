#!/usr/bin/env node
/**
 * AST-based i18n extractor + rewriter for Cogni.
 *
 * Walks every .tsx file under src/views, src/components, src/auth and:
 *   1. Collects every JSX-rendered string + translatable JSX attribute
 *      value + string arg to `setError`/`toast.*`/`window.confirm`.
 *   2. Generates a stable key per unique string per file
 *      (<componentName>.<slugOfString>).
 *   3. Rewrites the source in-place so the literal is replaced with a
 *      `t("key")` call, AND injects `import { useTranslation } from
 *      "react-i18next"` + `const { t } = useTranslation()` if missing
 *      from the file's React components.
 *   4. Emits a flat `en.json` of every extracted string and a per-file
 *      summary log so we can review what changed and translate to
 *      zh/ms/ta in bulk afterwards.
 *
 * Run with: `node scripts/i18n_extract.mjs [--dry-run] [--paths a,b,c]`
 *
 * Conservative by design — many edge cases are explicitly skipped
 * (template literals, computed prop names, strings inside arrays
 * outside JSX, etc.) so a human can review the diff and translate
 * the long-tail manually if needed.
 */

import { parse } from "@babel/parser";
import _traverse from "@babel/traverse";
import _generate from "@babel/generator";
import * as t from "@babel/types";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { glob } from "glob";

const traverse = _traverse.default ?? _traverse;
const generate = _generate.default ?? _generate;

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(REPO, "src");
const EN_PATH = path.join(SRC, "i18n/locales/en/common.json");

const DRY_RUN = process.argv.includes("--dry-run");
const PATHS_ARG = process.argv.find((a) => a.startsWith("--paths="));
const SCAN_GLOB = PATHS_ARG
  ? PATHS_ARG.replace("--paths=", "").split(",")
  : ["views/**/*.tsx", "components/**/*.tsx", "auth/**/*.tsx"];

const TRANSLATABLE_ATTR_NAMES = new Set([
  "label",
  "placeholder",
  "title",
  "alt",
  "aria-label",
  "ariaLabel",
  "hint",
  "ariaDescribedby",
]);

// String arg position 0 of these calls gets translated.
const TRANSLATABLE_FNS = new Set(["setError", "alert", "confirm"]);
const TRANSLATABLE_MEMBER_OBJS = new Set(["toast"]);

// Hard-coded skip list — strings that LOOK translatable but really aren't
// (technical identifiers, tooltip-text-on-icons that won't render, etc.).
const SKIP_EXACT = new Set([
  "—", "·", "•", "...", "…", "@", "x", "X", "{}", "[]", "•••••••", "••••••••",
  "GET", "POST", "PUT", "DELETE", "PATCH",
  "your-username", "X7K2QA", "your-name", "X",
]);

function isTranslatable(s) {
  if (typeof s !== "string") return false;
  const trimmed = s.trim();
  if (!trimmed) return false;
  if (SKIP_EXACT.has(trimmed)) return false;
  if (trimmed.length < 2) return false;
  // Numbers, dashes, punctuation only
  if (/^[\d\s\-:.,/%+_·•—…@(){}\[\]]+$/u.test(trimmed)) return false;
  // URLs / paths / module paths
  if (/^https?:\/\//.test(trimmed)) return false;
  if (trimmed.startsWith("/") && !trimmed.includes(" ")) return false;
  if (trimmed.startsWith("./") || trimmed.startsWith("../")) return false;
  // Single short word, lowercase — likely a CSS class or variable name
  if (/^[a-z][a-z0-9-]*$/.test(trimmed) && !trimmed.includes(" ") && trimmed.length < 12) {
    return false;
  }
  // Single short uppercase token — likely an abbreviation
  if (/^[A-Z][A-Z0-9-]*$/.test(trimmed) && trimmed.length < 6) return false;
  // Tailwind-flavoured class string: one-or-more lowercase-with-dashes
  // tokens, optionally with `variant:` prefixes (sm:, hover:, focus:,
  // dark:, etc.), space-separated. Covers "bg-red-50", "hover:bg-red-100",
  // "sm:flex-row sm:items-center", and similar.
  const cssToken = "(?:[a-z][a-z0-9-]*:)*[a-z\\[\\(][a-z0-9\\[\\]\\(\\)._/-]*";
  const cssClassRe = new RegExp(`^${cssToken}(\\s+${cssToken})*$`);
  if (cssClassRe.test(trimmed) && /[-:/]/.test(trimmed)) return false;
  return true;
}

function slugify(s, maxLen = 32) {
  const ascii = s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!ascii) return null;
  const words = ascii.split(/\s+/);
  const camel = words
    .map((w, i) => (i === 0 ? w : w[0].toUpperCase() + w.slice(1)))
    .join("")
    .slice(0, maxLen);
  return camel || null;
}

function componentNameFromPath(file) {
  const base = path.basename(file, ".tsx");
  return base[0].toLowerCase() + base.slice(1);
}

// Build a t-call AST node for a JSX expression context.
function tCall(key) {
  return t.callExpression(t.identifier("t"), [t.stringLiteral(key)]);
}

// For JSX text we wrap in a JSXExpressionContainer so the {t("…")}
// renders correctly.
function jsxExpression(key) {
  return t.jsxExpressionContainer(tCall(key));
}

// For attribute values: prop={t("…")} replaces prop="text".
function jsxAttrValue(key) {
  return t.jsxExpressionContainer(tCall(key));
}

const allEntries = []; // { file, key, en, kind }
const perFileImports = new Map();

const filesScanned = SCAN_GLOB.flatMap((g) =>
  glob.sync(g, { cwd: SRC, absolute: true }),
).filter((f) => !f.includes("i18n/")); // never rewrite our own i18n config files

for (const file of filesScanned) {
  const code = readFileSync(file, "utf-8");
  let ast;
  try {
    ast = parse(code, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    });
  } catch (err) {
    console.error(`[skip] ${path.relative(REPO, file)}: ${err.message}`);
    continue;
  }

  const componentName = componentNameFromPath(file);
  const seen = new Map(); // english trimmed -> key
  let collisionN = 0;
  let touchedJSX = false;
  let usesT = false;
  let hasUseTranslationImport = false;
  let importDeclEnd = null;
  const componentBodies = new Set(); // BlockStatement nodes that look like a React component

  function addKey(text, kind) {
    const trimmed = text.trim();
    if (!isTranslatable(trimmed)) return null;
    if (seen.has(trimmed)) return seen.get(trimmed);
    let slug = slugify(trimmed) || `t${collisionN++}`;
    let key = `${componentName}.${slug}`;
    // collide within file
    const existing = new Set(seen.values());
    let n = 2;
    while (existing.has(key)) {
      key = `${componentName}.${slug}${n++}`;
    }
    seen.set(trimmed, key);
    allEntries.push({ file: path.relative(REPO, file), key, en: trimmed, kind });
    return key;
  }

  // First pass: detect existing useTranslation import + component bodies.
  traverse(ast, {
    ImportDeclaration(p) {
      importDeclEnd = p.node;
      if (p.node.source.value === "react-i18next") {
        for (const s of p.node.specifiers) {
          if (
            s.type === "ImportSpecifier" &&
            s.imported.type === "Identifier" &&
            s.imported.name === "useTranslation"
          ) {
            hasUseTranslationImport = true;
          }
        }
      }
    },
    FunctionDeclaration(p) {
      // Top-level functions starting with uppercase are React components.
      if (p.node.id && /^[A-Z]/.test(p.node.id.name) && p.node.body) {
        componentBodies.add(p.node.body);
      }
    },
    VariableDeclarator(p) {
      if (
        p.node.id.type === "Identifier" &&
        /^[A-Z]/.test(p.node.id.name) &&
        p.node.init &&
        (p.node.init.type === "ArrowFunctionExpression" ||
          p.node.init.type === "FunctionExpression") &&
        p.node.init.body
      ) {
        const body =
          p.node.init.body.type === "BlockStatement"
            ? p.node.init.body
            : null;
        if (body) componentBodies.add(body);
      }
    },
  });

  // A string can only be replaced with `t(...)` if the enclosing
  // scope has access to a `t` binding. `t` is injected at the top of
  // each recognised React component body and is reachable via closure
  // from any nested function defined inside that body — so we only
  // need to check whether SOME ancestor is a component body. Helpers
  // at module level (with no enclosing component) correctly fall
  // through to `return false`.
  function isInsideComponentBody(p) {
    let cur = p.parentPath;
    while (cur) {
      if (cur.node && cur.node.type === "BlockStatement" && componentBodies.has(cur.node)) {
        return true;
      }
      cur = cur.parentPath;
    }
    return false;
  }

  // Second pass: extract + rewrite.
  traverse(ast, {
    JSXText(p) {
      const value = p.node.value;
      if (!value) return;
      if (!isInsideComponentBody(p)) return;
      // Preserve leading/trailing whitespace by splitting it off and
      // wrapping only the meaningful text.
      const m = value.match(/^(\s*)([\s\S]*?)(\s*)$/);
      if (!m) return;
      const [, leading, core, trailing] = m;
      if (!isTranslatable(core)) return;
      const key = addKey(core, "jsxText");
      if (!key) return;
      const replacement = [];
      if (leading) replacement.push(t.jsxText(leading));
      replacement.push(jsxExpression(key));
      if (trailing) replacement.push(t.jsxText(trailing));
      p.replaceWithMultiple(replacement);
      touchedJSX = true;
      usesT = true;
    },
    JSXAttribute(p) {
      const nameNode = p.node.name;
      const name = nameNode.type === "JSXIdentifier" ? nameNode.name : null;
      if (!name || !TRANSLATABLE_ATTR_NAMES.has(name)) return;
      if (!isInsideComponentBody(p)) return;
      const v = p.node.value;
      if (!v) return;
      let strNode = null;
      if (v.type === "StringLiteral") strNode = v;
      else if (
        v.type === "JSXExpressionContainer" &&
        v.expression.type === "StringLiteral"
      ) {
        strNode = v.expression;
      }
      if (!strNode) return;
      const key = addKey(strNode.value, `attr:${name}`);
      if (!key) return;
      p.node.value = jsxAttrValue(key);
      touchedJSX = true;
      usesT = true;
    },
    CallExpression(p) {
      const callee = p.node.callee;
      let label = null;
      if (callee.type === "Identifier" && TRANSLATABLE_FNS.has(callee.name)) {
        label = `fn:${callee.name}`;
      } else if (
        callee.type === "MemberExpression" &&
        callee.object.type === "Identifier" &&
        callee.property.type === "Identifier"
      ) {
        const obj = callee.object.name;
        const prop = callee.property.name;
        if (TRANSLATABLE_MEMBER_OBJS.has(obj)) {
          label = `fn:${obj}.${prop}`;
        } else if (obj === "window" && prop === "confirm") {
          label = `fn:window.confirm`;
        } else if (obj === "window" && prop === "alert") {
          label = `fn:window.alert`;
        }
      }
      if (!label) return;
      if (!isInsideComponentBody(p)) return;
      const arg = p.node.arguments[0];
      if (!arg) return;
      if (arg.type === "StringLiteral") {
        const key = addKey(arg.value, label);
        if (!key) return;
        p.node.arguments[0] = tCall(key);
        usesT = true;
      } else if (
        arg.type === "CallExpression" &&
        arg.callee.type === "Identifier" &&
        arg.callee.name === "t"
      ) {
        // already translated; leave as-is
      }
    },
    ConditionalExpression(p) {
      // Handle `{cond ? "A" : "B"}` inside JSX. Both branches get keys.
      // Only fire when both arms are StringLiteral so we don't accidentally
      // wrap mixed JSX/string ternaries.
      if (!isInsideComponentBody(p)) return;
      const cons = p.node.consequent;
      const alt = p.node.alternate;
      if (cons.type === "StringLiteral" && isTranslatable(cons.value)) {
        const key = addKey(cons.value, "ternary:consequent");
        if (key) {
          p.node.consequent = tCall(key);
          usesT = true;
        }
      }
      if (alt.type === "StringLiteral" && isTranslatable(alt.value)) {
        const key = addKey(alt.value, "ternary:alternate");
        if (key) {
          p.node.alternate = tCall(key);
          usesT = true;
        }
      }
    },
  });

  if (!touchedJSX && !usesT) {
    continue; // nothing to translate in this file
  }

  // Inject `useTranslation` import if missing.
  if (!hasUseTranslationImport) {
    const importNode = t.importDeclaration(
      [t.importSpecifier(t.identifier("useTranslation"), t.identifier("useTranslation"))],
      t.stringLiteral("react-i18next"),
    );
    // Insert after the last existing import for cleanliness.
    let inserted = false;
    traverse(ast, {
      Program(p) {
        const body = p.node.body;
        let lastImportIdx = -1;
        for (let i = 0; i < body.length; i++) {
          if (body[i].type === "ImportDeclaration") lastImportIdx = i;
        }
        body.splice(lastImportIdx + 1, 0, importNode);
        inserted = true;
        p.stop();
      },
    });
    if (!inserted) ast.program.body.unshift(importNode);
  }

  // Inject `const { t } = useTranslation();` at the top of every component
  // body that doesn't already have one.
  for (const body of componentBodies) {
    const alreadyHasT = body.body.some((stmt) => {
      if (stmt.type !== "VariableDeclaration") return false;
      for (const decl of stmt.declarations) {
        if (
          decl.id.type === "ObjectPattern" &&
          decl.init &&
          decl.init.type === "CallExpression" &&
          decl.init.callee.type === "Identifier" &&
          decl.init.callee.name === "useTranslation"
        ) {
          return true;
        }
      }
      return false;
    });
    if (alreadyHasT) continue;
    const stmt = t.variableDeclaration("const", [
      t.variableDeclarator(
        t.objectPattern([
          t.objectProperty(
            t.identifier("t"),
            t.identifier("t"),
            false,
            true,
          ),
        ]),
        t.callExpression(t.identifier("useTranslation"), []),
      ),
    ]);
    body.body.unshift(stmt);
  }

  const out = generate(ast, { retainLines: false, jsescOption: { minimal: true } }, code);
  perFileImports.set(file, out.code);

  if (!DRY_RUN) {
    writeFileSync(file, out.code);
  }
}

// Merge extracted keys into en/common.json under a flat structure.
const en = existsSync(EN_PATH) ? JSON.parse(readFileSync(EN_PATH, "utf-8")) : {};
let added = 0;
let collisions = 0;
for (const entry of allEntries) {
  const [group, leaf] = entry.key.split(".", 2);
  if (!en[group] || typeof en[group] !== "object") en[group] = {};
  if (en[group][leaf] && en[group][leaf] !== entry.en) {
    collisions++;
    // Keep existing — it was either hand-curated or earlier in the file.
    continue;
  }
  if (!en[group][leaf]) added++;
  en[group][leaf] = entry.en;
}
if (!DRY_RUN) {
  writeFileSync(EN_PATH, JSON.stringify(en, null, 2));
}

// Report
const byFile = {};
for (const e of allEntries) {
  byFile[e.file] = (byFile[e.file] || 0) + 1;
}
const totalUniqueKeys = new Set(allEntries.map((e) => e.key)).size;
console.log(
  JSON.stringify(
    {
      mode: DRY_RUN ? "dry-run" : "wrote files",
      filesScanned: filesScanned.length,
      filesTouched: perFileImports.size,
      totalExtracted: allEntries.length,
      uniqueKeys: totalUniqueKeys,
      addedToEn: added,
      collisions,
      perFile: Object.fromEntries(
        Object.entries(byFile).sort((a, b) => b[1] - a[1]),
      ),
    },
    null,
    2,
  ),
);
