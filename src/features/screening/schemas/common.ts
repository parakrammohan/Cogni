export type FieldKind = "number" | "binary" | "select";

export interface ScreeningField {
  name: string;
  label: string;
  kind: FieldKind;
  default: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: { value: number; label: string }[];
  hint?: string;
}

export interface ScreeningGroup {
  title: string;
  description: string;
  fields: ScreeningField[];
}

export const yesNo = (name: string, label: string, hint?: string): ScreeningField => ({
  name,
  label,
  kind: "binary",
  default: 0,
  hint,
});

export function defaultsFor(groups: ScreeningGroup[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of groups) for (const f of g.fields) out[f.name] = f.default;
  return out;
}
