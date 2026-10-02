import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { wsUrl } from "../../lib/api";
import { Button } from "../Button";

/** Interactive shell inside the container. */
export function TerminalView({ containerId }: { containerId: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [generation, setGeneration] = useState(0);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    if (!host.current) return;
    setClosed(false);
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
      theme: { background: "#0f1a14", foreground: "#d7e3dc", cursor: "#6fd39b", selectionBackground: "rgba(111, 211, 155, 0.25)" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host.current);
    fit.fit();

    const ws = new WebSocket(wsUrl(`/api/containers/${encodeURIComponent(containerId)}/exec`));
    ws.binaryType = "arraybuffer";
    const sendResize = () => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    };
    ws.onopen = () => {
      sendResize();
      term.focus();
    };
    ws.onmessage = (e) => {
      if (typeof e.data === "string") {
        // Text frames are JSON control messages (errors).
        try {
          const msg = JSON.parse(e.data) as { type: string; message?: string };
          if (msg.type === "error") term.writeln(`\r\n\x1b[31m${msg.message}\x1b[0m`);
        } catch {
          term.write(e.data);
        }
      } else {
        term.write(new Uint8Array(e.data as ArrayBuffer));
      }
    };
    ws.onclose = () => {
      term.writeln("\r\n\x1b[90m[session ended]\x1b[0m");
      setClosed(true);
    };
    const input = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "input", data }));
    });

    const observer = new ResizeObserver(() => {
      fit.fit();
      sendResize();
    });
    observer.observe(host.current);

    return () => {
      observer.disconnect();
      input.dispose();
      ws.onclose = null;
      ws.close();
      term.dispose();
    };
  }, [containerId, generation]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <span className="text-13 text-muted">Runs bash if the image has it, otherwise sh.</span>
        {closed && (
          <Button variant="cancel" size="sm" icon={RefreshCw} onClick={() => setGeneration((g) => g + 1)} className="ml-auto">
            New session
          </Button>
        )}
      </div>
      <div ref={host} className="h-[60vh] overflow-hidden rounded-lg border border-line bg-terminal" />
    </div>
  );
}
