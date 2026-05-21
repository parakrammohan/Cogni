/**
 * i18n setup for Cogni — four official Singapore languages.
 *
 * - en: English (default + fallback for any missing key)
 * - zh: 中文 (Simplified)
 * - ms: Bahasa Melayu
 * - ta: தமிழ் (Tamil)
 *
 * Language choice is persisted in localStorage under `cognitrack.lang`
 * so it survives reloads. On first load with no stored choice we
 * inspect `navigator.language` — if it starts with `zh`, `ms`, or
 * `ta` we pre-select that locale, otherwise fall back to English.
 *
 * Translations live in `./locales/<lang>/common.json` and are
 * eagerly imported (small JSON, no lazy-load needed for the
 * surfaces we currently translate).
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en/common.json";
import zh from "./locales/zh/common.json";
import ms from "./locales/ms/common.json";
import ta from "./locales/ta/common.json";

export const SUPPORTED_LANGS = ["en", "zh", "ms", "ta"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

const STORAGE_KEY = "cognitrack.lang";

/** Display label for the language picker — always in the language's
 *  own script so users can pick visually even if they can't read
 *  the current locale. */
export const LANG_LABELS: Record<Lang, string> = {
  en: "English",
  zh: "中文",
  ms: "Bahasa Melayu",
  ta: "தமிழ்",
};

function detectInitialLang(): Lang {
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && (SUPPORTED_LANGS as readonly string[]).includes(stored)) {
      return stored as Lang;
    }
  } catch {
    /* localStorage may be blocked (Safari private mode); fall through. */
  }
  const browser = (navigator.language || "en").toLowerCase();
  if (browser.startsWith("zh")) return "zh";
  if (browser.startsWith("ms") || browser.startsWith("id")) return "ms";
  if (browser.startsWith("ta")) return "ta";
  return "en";
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { common: en },
    zh: { common: zh },
    ms: { common: ms },
    ta: { common: ta },
  },
  lng: detectInitialLang(),
  fallbackLng: "en",
  defaultNS: "common",
  interpolation: { escapeValue: false /* React already escapes */ },
  // Don't print "missingKey" warnings; we'd rather render the English
  // fallback silently for any string we haven't translated yet.
  returnEmptyString: false,
});

/** Programmatically switch language. Persists to localStorage so the
 *  choice survives reloads. */
export function setLanguage(lang: Lang): void {
  void i18n.changeLanguage(lang);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
    // Update <html lang> for screen-reader / browser-translate signals.
    document.documentElement.lang = lang;
  } catch {
    /* localStorage may be blocked; harmless. */
  }
}

// Set <html lang> on first load too.
if (typeof document !== "undefined") {
  document.documentElement.lang = (i18n.language as Lang) || "en";
}

export default i18n;
