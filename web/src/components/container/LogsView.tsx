import clsx from "clsx";
import { Eraser, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LiveMessage, LogLine } from "../../../../shared/types";
import { useLiveSocket } from "../../lib/useLiveSocket";
import { Button } from "../Button";
import { SearchBar, Toggle } from "../SearchBar";

export const MAX_LOG_LINES = 5000;

// A stable key per line, so trimming the oldest lines doesn't re-render the rest.
type KeyedLine = LogLine & { seq: number };

export function LogsView({ containerId }: { containerId: string }) {
  const [lines, setLines] = useState<KeyedLine[]>([]);
  const seq = useRef(0);
  const [query, setQuery] = useState("");
  const [timestamps, setTimestamps] = useState(false);
  const [follow, setFollow] = useState(true);
  const [generation, setGeneration] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  const onMessage = useCallback((msg: LiveMessage) => {
    if (msg.type !== "logs") return;
    setLines((prev) => {
      const next = prev.concat(msg.lines.map((l) => ({ ...l, seq: seq.current++ })));
      return next.length > MAX_LOG_LINES ? next.slice(next.length - MAX_LOG_LINES) : next;
    });
  }, []);
  const { state, error } = useLiveSocket(`/api/containers/${encodeURIComponent(containerId)}/logs?tail=1000`, onMessage, generation);

  const visible = useMemo(() => {
    const q = query.toLowerCase();
    return q ? lines.filter((l) => l.text.toLowerCase().includes(q)) : lines;
  }, [lines, query]);

  useEffect(() => {
    if (follow && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [visible, follow]);

  const reconnect = () => {
    setLines([]);
    setGeneration((g) => g + 1);
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <SearchBar value={query} onChange={setQuery} placeholder="Filter logs" />
        <Toggle checked={follow} onChange={setFollow} label="Follow" />
        <Toggle checked={timestamps} onChange={setTimestamps} label="Timestamps" />
        <Button variant="cancel" size="sm" icon={Eraser} onClick={() => setLines([])}>
          Clear
        </Button>
        <span className="ml-auto flex items-center gap-2 text-13 text-muted" data-testid="log-state">
          {state === "open" && (
            <>
              <span className="live-dot h-2 w-2 rounded-full bg-primary" aria-hidden />
              Live
            </>
          )}
          {state === "connecting" && "Connecting…"}
          {state === "ended" && "Log stream ended (container stopped)."}
          {state === "error" && error}
        </span>
        {(state === "ended" || state === "error") && (
          <Button variant="cancel" size="sm" icon={RefreshCw} onClick={reconnect}>
            Reconnect
          </Button>
        )}
      </div>
      <div
        ref={scroller}
        role="log"
        onScroll={(e) => {
          // Scrolling up to read pauses following; scrolling back to the end resumes it.
          const el = e.currentTarget;
          const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          if (atEnd !== follow) setFollow(atEnd);
        }}
        className="h-[60vh] overflow-auto rounded-lg border border-line bg-white p-4 font-mono text-12 leading-5"
      >
        {visible.length === 0 ? (
          <p className="text-muted italic">{query ? "No lines match." : "No logs yet."}</p>
        ) : (
          visible.map((l) => (
            <div key={l.seq} className={clsx("whitespace-pre-wrap break-all", l.stream === "stderr" ? "text-danger" : "text-body")} data-stream={l.stream}>
              {timestamps && l.ts && <span className="mr-3 text-muted select-none">{l.ts.replace("T", " ").slice(0, 23)}</span>}
              {l.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
