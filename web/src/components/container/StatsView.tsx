import { useCallback, useState } from "react";
import type { LiveMessage, StatsSample } from "../../../../shared/types";
import { formatBytes, formatPercent } from "../../lib/format";
import { useLiveSocket } from "../../lib/useLiveSocket";
import { Meter, Sparkline } from "../Sparkline";

const HISTORY = 60;

function Tile({ label, value, detail, children }: { label: string; value: string; detail?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-white p-5">
      <div className="text-13 text-grey">{label}</div>
      <div className="mt-2 text-2xl font-medium text-ink">{value}</div>
      {detail && <div className="mt-1 text-13 text-muted">{detail}</div>}
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
    return <p className="text-13 text-muted">{state === "error" ? error : state === "ended" ? "Container is not running." : "Waiting for the first sample…"}</p>;
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
      <Tile label="Network I/O" value={`↓ ${formatBytes(last.netRx)}`} detail={`↑ ${formatBytes(last.netTx)} sent`} />
      <Tile label="Block I/O" value={`${formatBytes(last.blockRead)} read`} detail={`${formatBytes(last.blockWrite)} written · ${last.pids} processes`} />
    </div>
  );
}
