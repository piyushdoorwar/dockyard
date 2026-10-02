import { ArrowDown, ArrowUp, ChevronRight, ChevronsUpDown, Loader2 } from "lucide-react";
import { Fragment, type ReactNode, useMemo, useState } from "react";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Makes the column sortable by this value. */
  sortValue?: (row: T) => string | number | null;
  width?: number;
  /** Keeps a text column readable on narrow screens; the table scrolls instead. */
  minWidth?: number;
}

interface DataTableProps<T> {
  rows: T[];
  rowKey: (row: T) => string;
  columns: Column<T>[];
  loading?: boolean;
  empty: ReactNode;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  /** Renders a detail row under an expanded row; adds a chevron column. */
  expansion?: (row: T) => ReactNode;
  expandLabel?: (row: T) => string;
}

type Sort = { key: string; dir: "asc" | "desc" } | null;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compare(a: string | number | null, b: string | number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return typeof a === "number" && typeof b === "number" ? a - b : collator.compare(String(a), String(b));
}

/** Table with click-to-sort headers (ascending, descending, off) and optional row expansion. */
export function DataTable<T>({ rows, rowKey, columns, loading, empty, defaultSort, expansion, expandLabel }: DataTableProps<T>) {
  const [sort, setSort] = useState<Sort>(defaultSort ?? null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const sorted = useMemo(() => {
    const col = sort ? columns.find((c) => c.key === sort.key) : undefined;
    if (!sort || !col?.sortValue) return rows;
    const value = col.sortValue;
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => sign * compare(value(a), value(b)));
  }, [rows, columns, sort]);

  const cycle = (key: string) =>
    setSort((s) => (s?.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : null));

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const span = columns.length + (expansion ? 1 : 0);

  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {expansion && <th style={{ width: 48 }} aria-label="Expand" />}
            {columns.map((c) => {
              const active = sort?.key === c.key ? sort.dir : undefined;
              const Icon = active === "asc" ? ArrowUp : active === "desc" ? ArrowDown : ChevronsUpDown;
              return (
                <th
                  key={c.key}
                  style={c.width || c.minWidth ? { width: c.width, minWidth: c.minWidth } : undefined}
                  aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : undefined}
                >
                  {c.sortValue ? (
                    <button type="button" className="data-table-sort" data-active={active ? "" : undefined} onClick={() => cycle(c.key)}>
                      {c.header}
                      <Icon size={12} className={active ? "text-accent" : "text-muted"} aria-hidden />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading && rows.length === 0 ? (
            <tr>
              <td colSpan={span}>
                <span className="flex items-center justify-center gap-2 py-6 text-13 text-muted">
                  <Loader2 size={15} className="spin" aria-hidden /> Loading
                </span>
              </td>
            </tr>
          ) : sorted.length === 0 ? (
            <tr>
              <td colSpan={span}>{empty}</td>
            </tr>
          ) : (
            sorted.map((row) => {
              const key = rowKey(row);
              const open = expanded.has(key);
              return (
                <Fragment key={key}>
                  <tr>
                    {expansion && (
                      <td>
                        <button
                          type="button"
                          aria-expanded={open}
                          aria-label={expandLabel?.(row) ?? "Show details"}
                          onClick={() => toggle(key)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-grey hover:bg-primary-soft hover:text-accent"
                        >
                          <ChevronRight size={15} className={open ? "rotate-90 transition-transform" : "transition-transform"} aria-hidden />
                        </button>
                      </td>
                    )}
                    {columns.map((c) => (
                      <td key={c.key}>{c.render(row)}</td>
                    ))}
                  </tr>
                  {expansion && open && (
                    <tr className="data-table-expansion">
                      <td colSpan={span}>{expansion(row)}</td>
                    </tr>
                  )}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
