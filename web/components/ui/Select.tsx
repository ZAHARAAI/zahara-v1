"use client";

export function Select({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  disabled?: boolean;
}) {
  return (
    <div>
      {label && <div className="text-xs mb-1 ms-1 opacity-70">{label}</div>}
      <select
        value={value}
        name={label}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        disabled={disabled}
      >
        {options.map(([v, l]) => (
          <option className="bg-panel" key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}
