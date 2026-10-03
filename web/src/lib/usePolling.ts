import { useCallback, useEffect, useRef, useState } from "react";

export interface Polled<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * Fetch now and every `intervalMs` while the tab is visible. Docker has no
 * cheap change feed for lists, and a few local requests every few seconds is
 * what Docker Desktop effectively does too.
 */
export function usePolling<T>(fetcher: () => Promise<T>, intervalMs: number): Polled<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const requestRef = useRef<() => Promise<void>>(async () => {});
  const refresh = useCallback(() => requestRef.current(), []);

  useEffect(() => {
    let active = true;
    let inFlight: Promise<void> | undefined;
    let queued = false;
    const request = (force: boolean): Promise<void> => {
      if (inFlight) {
        // A mutation may finish during an older read. Fetch again afterwards
        // and let the caller await the fresh result rather than dropping it.
        if (force) queued = true;
        return inFlight;
      }
      inFlight = (async () => {
        do {
          queued = false;
          try {
            const next = await Promise.resolve().then(fetcherRef.current);
            if (active) {
              setData(next);
              setError(undefined);
            }
          } catch (err) {
            if (active) setError(err instanceof Error ? err : new Error(String(err)));
          } finally {
            if (active) setLoading(false);
          }
        } while (active && queued);
      })().finally(() => { inFlight = undefined; });
      return inFlight;
    };
    requestRef.current = () => request(true);
    const poll = () => {
      if (document.visibilityState !== "hidden") void request(false);
    };
    poll();
    const timer = setInterval(poll, intervalMs);
    document.addEventListener("visibilitychange", poll);
    return () => {
      active = false;
      requestRef.current = async () => {};
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [intervalMs]);

  return { data, error, loading, refresh };
}
