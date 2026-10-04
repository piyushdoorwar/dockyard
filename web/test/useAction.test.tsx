import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../src/components/Toast";
import { useAction } from "../src/lib/useAction";

const wrapper = ({ children }: { children: ReactNode }) => <ToastProvider>{children}</ToastProvider>;

describe("useAction", () => {
  it("refreshes after an action", async () => {
    const refresh = vi.fn();
    const { result } = renderHook(() => useAction(refresh), { wrapper });
    await act(() => result.current.run("x", async () => "done"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("skips the refresh when a success leaves the item behind", async () => {
    const refresh = vi.fn();
    const { result } = renderHook(() => useAction(refresh), { wrapper });
    await act(() => result.current.run("x", async () => "done", undefined, { leaving: true }));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("still refreshes when a leaving action fails", async () => {
    const refresh = vi.fn();
    const { result } = renderHook(() => useAction(refresh), { wrapper });
    await act(() => result.current.run("x", () => Promise.reject(new Error("nope")), undefined, { leaving: true }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
