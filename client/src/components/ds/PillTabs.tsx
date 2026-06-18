import { cn } from "@/lib/utils";

interface PillTabsProps<T extends string> {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}

/** Horizontal pill tabs — Today / Week / Month, etc. */
export function PillTabs<T extends string>({ options, value, onChange, className }: PillTabsProps<T>) {
  return (
    <div className={cn("pill-tabs -mx-1 px-1", className)} role="tablist">
      {options.map(o => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={value === o.id}
          className={cn("pill-tab", value === o.id && "active")}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
