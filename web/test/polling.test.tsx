import { act, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePolling } from "../src/lib/usePolling";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("polling lifecycle", () => {
  it("queues a fresh read when a mutation refresh races an existing request", async () => {
    const old = deferred<string>();
    const fresh = deferred<string>();
    const fetcher = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const { result } = renderHook(() => usePolling(fetcher, 1000));
    await act(async () => {});
    let refresh!: Promise<void>;
    let completed = false;
    act(() => { refresh = result.current.refresh().then(() => { completed = true; }); });
    await act(async () => { old.resolve("old"); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(completed).toBe(false);
    await act(async () => { fresh.resolve("fresh"); await refresh; });
    expect(result.current.data).toBe("fresh");
  });

  it("does not overlap periodic requests", async () => {
    vi.useFakeTimers();
    const pending = deferred<string>();
    const fetcher = vi.fn().mockReturnValue(pending.promise);
    const { unmount } = renderHook(() => usePolling(fetcher, 1000));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(fetcher).toHaveBeenCalledTimes(1);
    unmount();
    pending.resolve("done");
  });

  it("pauses while hidden and refreshes immediately when visible", async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const fetcher = vi.fn().mockResolvedValue("visible");
    renderHook(() => usePolling(fetcher, 1000));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(fetcher).not.toHaveBeenCalled();
    await act(async () => {
      visibility.mockReturnValue("visible");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("ignores stale responses from StrictMode's discarded effect", async () => {
    const old = deferred<string>();
    const fetcher = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue("current");
    const { result } = renderHook(() => usePolling(fetcher, 1000), { wrapper: StrictMode });
    await act(async () => {});
    expect(result.current.data).toBe("current");
    await act(async () => { old.resolve("stale"); });
    expect(result.current.data).toBe("current");
  });
});
