import type { ScreeningField, ScreeningGroup } from "../../features/screening/schemas/common";

interface FormRendererProps {
  groups: ScreeningGroup[];
  values: Record<string, number>;
  onChange: (name: string, value: number) => void;
}

export function FormRenderer({ groups, values, onChange }: FormRendererProps) {
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.title}>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              {group.title}
            </h3>
            <span className="text-xs text-slate-400">{group.description}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.fields.map((field) => (
              <Field
                key={field.name}
                field={field}
                value={values[field.name]}
                onChange={(v) => onChange(field.name, v)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Field({
  field,
  value,
  onChange,
}: {
  field: ScreeningField;
  value: number | undefined;
  onChange: (v: number) => void;
}) {
  const v = Number.isFinite(value) ? (value as number) : field.default;

  if (field.kind === "binary") {
    return (
      <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
        <span className="font-medium text-slate-800">
          {field.label}
          {field.hint ? (
            <span className="ml-1 text-xs font-normal text-slate-400">{field.hint}</span>
          ) : null}
        </span>
        <input
          type="checkbox"
          checked={v === 1}
          onChange={(e) => onChange(e.target.checked ? 1 : 0)}
          className="h-4 w-4 cursor-pointer accent-cyan-600"
        />
      </label>
    );
  }

  if (field.kind === "select") {
    return (
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-slate-800">{field.label}</span>
        <select
          value={v}
          onChange={(e) => onChange(Number(e.target.value))}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200"
        >
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {field.hint ? <span className="text-xs text-slate-400">{field.hint}</span> : null}
      </label>
    );
  }

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="flex items-baseline justify-between font-medium text-slate-800">
        {field.label}
        {field.unit ? (
          <span className="text-xs font-normal text-slate-400">{field.unit}</span>
        ) : null}
      </span>
      <input
        type="number"
        value={v}
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200"
      />
      {field.hint ? <span className="text-xs text-slate-400">{field.hint}</span> : null}
    </label>
  );
}
