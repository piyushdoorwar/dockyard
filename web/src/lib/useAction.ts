import { useCallback, useState } from "react";
import { useToast } from "../components/Toast";
import { errorMessage } from "./api";

/**
 * Wrap a mutating API call: tracks which item is busy, toasts the outcome and
 * refreshes the list afterwards.
 */
export function useAction(refresh: () => Promise<void> | void) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(key: string, fn: () => Promise<T>, success?: string | ((result: T) => string)): Promise<T | undefined> => {
      setBusy(key);
      try {
        const result = await fn();
        if (success) toast.success(typeof success === "function" ? success(result) : success);
        return result;
      } catch (err) {
        toast.error("Something went wrong", errorMessage(err));
        return undefined;
      } finally {
        setBusy(null);
        await refresh();
      }
    },
    [refresh, toast],
  );

  return { busy, run };
}
