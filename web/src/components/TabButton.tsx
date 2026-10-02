import clsx from "clsx";
import type { LucideIcon } from "lucide-react";

export interface Tab<T extends string> {
  id: T;
  label: string;
  icon?: LucideIcon;
}

/** Segmented control: a bordered pill group with a solid green active item. */
export function TabButton<T extends string>({ tabs, active, onChange }: { tabs: Tab<T>[]; active: T; onChange: (id: T) => void }) {
  return (
    <div role="tablist" className="inline-flex max-w-full overflow-x-auto rounded-lg border border-line bg-surface p-1">
      {tabs.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          role="tab"
          type="button"
          aria-selected={id === active}
          onClick={() => onChange(id)}
          className={clsx(
            "inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-13 whitespace-nowrap transition-colors",
            id === active ? "bg-primary text-white" : "text-grey hover:bg-line-soft",
          )}
        >
          {Icon && <Icon size={14} strokeWidth={2} aria-hidden />}
          {label}
        </button>
      ))}
    </div>
  );
}
