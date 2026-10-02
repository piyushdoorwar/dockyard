import { useState } from "react";

interface SparklineProps {
  values: number[];
  /** Fixed ceiling (e.g. 100 for %); otherwise scales to the max seen. */
  max?: number;
  format: (v: number) => string;
  label: string;
  height?: number;
}

/**
 * Single-series trend line for a stat tile: brand-primary 2px line, recessive
 * baseline, hover shows the value at that point.
 */
export function Sparkline({ values, max, format, label, height = 48 }: SparklineProps) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 240;
  if (values.length < 2) return <div style={{ height }} aria-hidden />;
  const ceiling = Math.max(max ?? 0, ...values, 1e-9);
  const step = width / (values.length - 1);
  const y = (v: number) => height - 2 - (v / ceiling) * (height - 4);
  const points = values.map((v, i) => `${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const hi = hover ?? values.length - 1;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="block w-full"
        style={{ height }}
        role="img"
        aria-label={`${label}: latest ${format(values[values.length - 1])}`}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const i = Math.round(((e.clientX - rect.left) / rect.width) * (values.length - 1));
          setHover(Math.max(0, Math.min(values.length - 1, i)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        <line x1="0" x2={width} y1={height - 1} y2={height - 1} stroke="var(--color-line-soft)" strokeWidth="1" />
        <polyline points={points} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {hover !== null && (
          <line x1={hi * step} x2={hi * step} y1="0" y2={height} stroke="var(--color-line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {hover !== null && (
        <span className="pointer-events-none absolute -top-6 right-0 rounded bg-ink px-1.5 py-0.5 font-mono text-11 text-canvas">
          {format(values[hi])}
        </span>
      )}
    </div>
  );
}

/** Usage against a limit: fill in brand primary on a lighter step of the same hue. */
export function Meter({ percent, label }: { percent: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className="h-2 w-full overflow-hidden rounded-full bg-primary-soft"
    >
      <div className="h-full rounded-full bg-accent" style={{ width: `${clamped}%` }} />
    </div>
  );
}
