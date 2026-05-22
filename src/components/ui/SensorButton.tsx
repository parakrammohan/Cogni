import type { ReactNode } from "react";
import { cx } from "../../lib/utils";
import { useTranslation } from "react-i18next";
interface SensorButtonProps {
  active: boolean;
  label: string;
  description?: string;
  icon: ReactNode;
  onClick: () => void;
  /**
   * @deprecated retained for backwards compat — visual is light/light only now.
   */
  tone?: "dark" | "light";
}
export default function SensorButton({
  active,
  label,
  description,
  icon,
  onClick,
}: SensorButtonProps) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "group flex h-full w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition",
        active
          ? "border-cyan-300 bg-cyan-50 text-slate-900 shadow-(--shadow-soft)"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
      )}
    >
      <span
        className={cx(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition",
          active ? "bg-cyan-100 text-cyan-700" : "bg-slate-100 text-slate-600",
        )}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-tight">{label}</span>
        {description ? (
          <span className="block text-xs leading-snug text-slate-500">{description}</span>
        ) : null}
      </span>
      <span
        className={cx(
          "h-2 w-2 shrink-0 rounded-full",
          active ? t("sensorButton.bgEmerald500Shadow0003pxRgba1618") : "bg-slate-300",
        )}
        aria-hidden
      />
    </button>
  );
}
