import type { ReactNode } from "react";

interface BaseCardProps {
  label: string;
  value: ReactNode;
  description?: string;
}

interface MetricCardProps extends BaseCardProps {
  icon: ReactNode;
}

export function MetricCard({ icon, label, value, description }: MetricCardProps) {
  return (
    <div className="relative overflow-hidden rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_24px_80px_rgba(13,23,32,0.08)]">
      <div className="pointer-events-none absolute inset-y-0 right-0 w-28 bg-gradient-to-l from-cyan/8 to-transparent"></div>
      <div className="relative flex items-center gap-3 text-ink">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100">
          {icon}
        </div>
        <div className="text-sm font-semibold uppercase tracking-[0.28em] text-slate-500">
          {label}
        </div>
      </div>
      <div className="relative mt-4 text-4xl font-semibold text-ink">{value}</div>
      {description ? (
        <p className="relative mt-3 text-base leading-7 text-slate-600">{description}</p>
      ) : null}
    </div>
  );
}

export function InfoStat({ label, value }: BaseCardProps) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_12px_40px_rgba(13,23,32,0.05)]">
      <div className="text-xs uppercase tracking-[0.28em] text-slate-500">{label}</div>
      <div className="mt-2 text-4xl font-semibold text-ink">{value}</div>
    </div>
  );
}

export function DarkMetricCard({ label, value, description }: BaseCardProps) {
  return (
    <div className="relative overflow-hidden rounded-[24px] border border-white/10 bg-white/6 p-4">
      <div className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-cyan/8 to-transparent"></div>
      <div className="text-xs uppercase tracking-[0.28em] text-slate-400">{label}</div>
      <div className="relative mt-2 text-2xl font-semibold text-white">{value}</div>
      {description ? <p className="mt-2 text-sm text-slate-300">{description}</p> : null}
    </div>
  );
}
