import { ChevronDown } from "lucide-react";

interface SettingsDropdownProps {
  label: string;
  value: string;
  options: Array<string | { label: string; value: string }>;
  onChange: (value: string) => void;
}

export function SettingsDropdown({ label, value, options, onChange }: SettingsDropdownProps) {
  const safeOptions =
    options.length > 0
      ? options.some((opt) => (typeof opt === "string" ? opt === value : opt.value === value))
        ? options
        : [{ label: value, value }, ...options]
      : [{ label: value, value }];

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[14px] text-brand-mid">{label}</label>
      <div className="relative">
        <select
          className="w-full appearance-none bg-[#302c2c] border border-[#646262] rounded-[4px] px-3 py-2 text-[14px] text-brand-light focus:outline-none focus:border-brand-accent transition-colors"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          {safeOptions.map((opt) => {
            const optionValue = typeof opt === "string" ? opt : opt.value;
            const optionLabel = typeof opt === "string" ? opt : opt.label;

            return (
              <option key={optionValue} value={optionValue} className="bg-[#201d1d]">
                {optionLabel}
              </option>
            );
          })}
        </select>
        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-mid pointer-events-none" />
      </div>
    </div>
  );
}
