import { useEffect, useRef, useState } from "react";
import type { LiveMessage } from "../../../shared/types";
import { wsUrl } from "./api";

export type SocketState = "connecting" | "open" | "ended" | "error";

/**
 * Subscribe to a JSON message WebSocket (logs, stats). Bump `generation` to
 * reconnect, e.g. after the container restarts and the stream ended.
 */
export function useLiveSocket(
  path: string,
  onMessage: (msg: LiveMessage) => void,
  generation = 0,
): { state: SocketState; error: string | null } {
  const [state, setState] = useState<SocketState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const handler = useRef(onMessage);
  handler.current = onMessage;

  useEffect(() => {
    setState("connecting");
    setError(null);
    const ws = new WebSocket(wsUrl(path));
    let finished = false;
    ws.onopen = () => setState("open");
    ws.onmessage = (event) => {
      let msg: LiveMessage;
      try {
        msg = JSON.parse(String(event.data)) as LiveMessage;
      } catch {
        return;
      }
      if (msg.type === "error") {
        finished = true;
        setError(msg.message);
        setState("error");
      } else if (msg.type === "end") {
        finished = true;
        setState("ended");
      }
      handler.current(msg);
    };
    ws.onclose = () => {
      if (!finished) setState("ended");
    };
    ws.onerror = () => {
      finished = true;
      setError("Could not connect to the live stream. Try reconnecting.");
      setState("error");
    };
    return () => {
      finished = true;
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.close();
    };
  }, [path, generation]);

  return { state, error };
}
