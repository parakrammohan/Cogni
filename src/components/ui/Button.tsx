import type { ButtonHTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";

import { cx } from "../../lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-slate-900 text-white shadow-sm hover:bg-slate-800 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:bg-slate-950 disabled:bg-slate-400 disabled:shadow-none disabled:hover:translate-y-0",
  secondary:
    "border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-900 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:bg-cyan-100",
  ghost:
    "bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200",
  danger:
    "bg-red-600 text-white shadow-sm hover:bg-red-500 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 active:bg-red-700",
};

const sizeClasses: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, icon, iconRight, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cx(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl font-medium transition-all duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-60",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {icon ? <span aria-hidden>{icon}</span> : null}
      {children}
      {iconRight ? <span aria-hidden>{iconRight}</span> : null}
    </button>
  );
});
