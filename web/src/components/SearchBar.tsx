interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChange, placeholder = "Search" }: SearchBarProps) {
  return (
    <label className="relative flex items-center">
      <i className="pi pi-search absolute left-3 text-muted" style={{ fontSize: 13 }} aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-10 w-64 rounded-md border border-line bg-white pl-9 pr-3 text-13 text-body placeholder:text-muted focus:border-primary focus:outline-none"
      />
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-13 text-grey select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-line accent-[#2017CE]"
      />
      {label}
    </label>
  );
}
