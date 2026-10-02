const UNITS = ["B", "KB", "MB", "GB", "TB"];

/** Decimal units, like the Docker CLI ("142 MB"). */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1000) return `${Math.round(bytes)} B`;
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit++;
  }
  const digits = value < 10 ? 2 : value < 100 ? 1 : 0;
  return `${Number(value.toFixed(digits))} ${UNITS[unit]}`;
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "3 hours ago" from a Unix-seconds timestamp or an ISO string. */
export function timeAgo(when: number | string | null | undefined, now = Date.now()): string {
  if (when === null || when === undefined) return "—";
  const ms = typeof when === "number" ? when * 1000 : Date.parse(when);
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const seconds = Math.round((ms - now) / 1000);
  for (const [unit, size] of STEPS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

export function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}

/** Exit code from Docker's status text, e.g. "Exited (137) 2 hours ago" → 137. */
export function exitCode(status: string): number | null {
  const m = /^Exited \((\d+)\)/.exec(status);
  return m ? Number(m[1]) : null;
}
