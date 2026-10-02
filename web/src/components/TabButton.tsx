import clsx from "clsx";

export interface Tab<T extends string> {
  id: T;
  label: string;
}

/** Shared segmented tab control. */
export function TabButton<T extends string>({ tabs, active, onChange }: { tabs: Tab<T>[]; active: T; onChange: (id: T) => void }) {
  return (
    <div role="tablist" className="inline-flex rounded-lg border border-line bg-white p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={t.id === active}
          onClick={() => onChange(t.id)}
          className={clsx(
            "rounded-lg px-5 py-1.5 text-[13px] whitespace-nowrap",
            t.id === active ? "bg-primary-focus text-white" : "text-grey hover:bg-gray-100",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
