import { ArrowDown, ArrowUp, Loader2, RefreshCw } from "lucide-react";
import { type ReactNode, useCallback, useState } from "react";
import type { LiveMessage, StatsSample } from "../../../../shared/types";
import { formatBytes, formatPercent } from "../../lib/format";
import { useLiveSocket } from "../../lib/useLiveSocket";
import { Button } from "../Button";
import { Meter, Sparkline } from "../Sparkline";

const HISTORY = 60;

function Tile({ label, value, detail, children }: { label: string; value: ReactNode; detail?: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-5">
      <div className="text-13 text-grey">{label}</div>
      <div className="mt-2 flex items-center gap-1.5 text-2xl font-medium text-ink">{value}</div>
      {detail && <div className="mt-1 flex items-center gap-1 text-13 text-muted">{detail}</div>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

export function StatsView({ containerId }: { containerId: string }) {
  const [samples, setSamples] = useState<StatsSample[]>([]);
  const [generation, setGeneration] = useState(0);
  const onMessage = useCallback((msg: LiveMessage) => {
    if (msg.type === "stats") setSamples((prev) => [...prev.slice(-(HISTORY - 1)), msg.sample]);
  }, []);
  const { state, error } = useLiveSocket(`/api/containers/${encodeURIComponent(containerId)}/stats`, onMessage, generation);
  const last = samples[samples.length - 1];

  if (!last) {
    if (state === "error" || state === "ended") return <p className="text-13 text-muted">{state === "error" ? error : "Container is not running."}</p>;
    return (
      <p className="flex items-center gap-2 text-13 text-muted">
        <Loader2 size={14} className="spin" aria-hidden /> Waiting for the first sample
      </p>
    );
  }
  const stopped = state === "ended" || state === "error";
  return (
    <>
      {stopped && (
        // The last sample stays on screen, so say plainly that it is no longer live.
        <div className="mb-3 flex items-center gap-3" data-testid="stats-state">
          <span className="text-13 text-muted">{state === "error" ? error : "Stats stream ended. Showing the last sample."}</span>
          <Button variant="cancel" size="sm" icon={RefreshCw} onClick={() => setGeneration((g) => g + 1)}>
            Reconnect
          </Button>
        </div>
      )}
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
              <ArrowDown size={18} className="text-accent" aria-label="received" />
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
    </>
  );
}
