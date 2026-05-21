/**
 * Language picker — 4-way segmented control over Singapore's official
 * languages: English, Mandarin (Simplified), Bahasa Melayu, and Tamil.
 *
 * Each option is labelled in its own script so users can pick visually
 * even if they can't read the current locale (especially important on
 * the patient side — the patient may have landed on the wrong language
 * by accident and needs to escape).
 *
 * The selection persists in localStorage via `setLanguage`; that
 * function also updates <html lang> for screen-reader / browser-
 * translate signals.
 */

import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";

import { LANG_LABELS, SUPPORTED_LANGS, setLanguage, type Lang } from "../i18n/config";
import { cx } from "../lib/utils";

interface LanguagePickerProps {
  /** Render as a labelled row (default) or as a bare button group. */
  variant?: "row" | "bare";
  className?: string;
}

export function LanguagePicker({ variant = "row", className }: LanguagePickerProps) {
  const { t, i18n } = useTranslation();
  const current = (i18n.language as Lang) || "en";

  const buttons = (
    <div role="radiogroup" aria-label={t("common.language")} className="flex flex-wrap gap-1.5">
      {SUPPORTED_LANGS.map((code) => {
        const active = current === code;
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setLanguage(code)}
            className={cx(
              "rounded-full border px-3 py-1 text-sm font-semibold transition",
              active
                ? "border-cyan-500 bg-cyan-50 text-cyan-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            )}
          >
            {LANG_LABELS[code]}
          </button>
        );
      })}
    </div>
  );

  if (variant === "bare") {
    return <div className={className}>{buttons}</div>;
  }
  return (
    <div
      className={cx(
        "flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-(--shadow-soft) sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <Languages size={16} className="text-cyan-600" aria-hidden />
        {t("common.language")}
      </div>
      {buttons}
    </div>
  );
}
