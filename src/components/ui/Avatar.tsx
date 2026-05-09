import { cx } from "../../lib/utils";

interface AvatarProps {
  name: string;
  src?: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  /** Optional override for the colored ring/background hue */
  hue?: "cyan" | "amber" | "emerald" | "rose" | "violet" | "slate";
}

const SIZE: Record<NonNullable<AvatarProps["size"]>, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-12 w-12 text-base",
  lg: "h-16 w-16 text-lg",
  xl: "h-24 w-24 text-2xl",
};

const HUE: Record<NonNullable<AvatarProps["hue"]>, string> = {
  cyan: "bg-gradient-to-br from-cyan-200 to-cyan-400 text-cyan-900",
  amber: "bg-gradient-to-br from-amber-200 to-amber-400 text-amber-900",
  emerald: "bg-gradient-to-br from-emerald-200 to-emerald-400 text-emerald-900",
  rose: "bg-gradient-to-br from-rose-200 to-rose-400 text-rose-900",
  violet: "bg-gradient-to-br from-violet-200 to-violet-400 text-violet-900",
  slate: "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900",
};

const HUE_ORDER: Array<NonNullable<AvatarProps["hue"]>> = [
  "cyan",
  "amber",
  "emerald",
  "rose",
  "violet",
  "slate",
];

/**
 * Avatar with photo-or-initials fallback. The hue is deterministically picked
 * from the name when not specified, so contacts keep stable colors.
 */
export function Avatar({ name, src, size = "md", className, hue }: AvatarProps) {
  const initials = computeInitials(name);
  const computedHue = hue ?? hueForName(name);
  const sizeClass = SIZE[size];
  const hueClass = HUE[computedHue];

  if (src) {
    return (
      <span
        className={cx(
          "inline-flex shrink-0 overflow-hidden rounded-full ring-2 ring-white shadow-sm",
          sizeClass,
          className,
        )}
      >
        <img src={src} alt={name} className="h-full w-full object-cover" />
      </span>
    );
  }

  return (
    <span
      aria-label={name}
      className={cx(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold ring-2 ring-white shadow-sm",
        sizeClass,
        hueClass,
        className,
      )}
    >
      {initials}
    </span>
  );
}

function computeInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("");
}

function hueForName(name: string): NonNullable<AvatarProps["hue"]> {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  const idx = Math.abs(hash) % HUE_ORDER.length;
  return HUE_ORDER[idx]!;
}
