import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import type { LiveMessage, StatsSample } from "../../../../shared/types";
import { formatBytes, formatPercent } from "../../lib/format";
import { useLiveSocket } from "../../lib/useLiveSocket";
import { Meter, Sparkline } from "../Sparkline";

const HISTORY = 60;

function Tile({ label, value, detail, children }: { label: string; value: ReactNode; detail?: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-white p-5">
      <div className="text-13 text-grey">{label}</div>
      <div className="mt-2 flex items-center gap-1.5 text-2xl font-medium text-ink">{value}</div>
      {detail && <div className="mt-1 flex items-center gap-1 text-13 text-muted">{detail}</div>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

export function StatsView({ containerId }: { containerId: string }) {
  const [samples, setSamples] = useState<StatsSample[]>([]);
  const onMessage = useCallback((msg: LiveMessage) => {
    if (msg.type === "stats") setSamples((prev) => [...prev.slice(-(HISTORY - 1)), msg.sample]);
  }, []);
  const { state, error } = useLiveSocket(`/api/containers/${encodeURIComponent(containerId)}/stats`, onMessage);
  const last = samples[samples.length - 1];

  if (!last) {
    if (state === "error" || state === "ended") return <p className="text-13 text-muted">{state === "error" ? error : "Container is not running."}</p>;
    return (
      <p className="flex items-center gap-2 text-13 text-muted">
        <Loader2 size={14} className="spin" aria-hidden /> Waiting for the first sample
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Tile label="CPU" value={formatPercent(last.cpuPercent)} detail="100% = one full core">
        <Sparkline values={samples.map((s) => s.cpuPercent)} format={formatPercent} label="CPU usage" />
      </Tile>
      <Tile label="Memory" value={formatBytes(last.memUsage)} detail={`of ${formatBytes(last.memLimit)} (${formatPercent(last.memPercent)})`}>
        <Sparkline values={samples.map((s) => s.memUsage)} format={formatBytes} label="Memory usage" />
        <div className="mt-3">
          <Meter percent={last.memPercent} label="Memory used of limit" />
        </div>
      </Tile>
      <Tile
        label="Network I/O"
        value={
          <>
            <ArrowDown size={18} className="text-primary" aria-label="received" />
            {formatBytes(last.netRx)}
          </>
        }
        detail={
          <>
            <ArrowUp size={13} aria-hidden />
            {formatBytes(last.netTx)} sent
          </>
        }
      />
      <Tile label="Block I/O" value={`${formatBytes(last.blockRead)} read`} detail={`${formatBytes(last.blockWrite)} written · ${last.pids} processes`} />
    </div>
  );
}
