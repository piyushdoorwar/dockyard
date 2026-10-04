import { useCallback, useState } from "react";
import { useToast } from "../components/Toast";
import { errorMessage } from "./api";

/**
 * Wrap a mutating API call: tracks which item is busy, toasts the outcome and
 * refreshes the list afterwards. Pass `leaving` when a success navigates away
 * from the item, so we don't re-fetch something that no longer exists.
 */
export function useAction(refresh: () => Promise<void> | void) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const run = useCallback(
    async <T,>(
      key: string,
      fn: () => Promise<T>,
      success?: string | ((result: T) => string),
      { leaving = false }: { leaving?: boolean } = {},
    ): Promise<T | undefined> => {
      setBusy(key);
      let ok = false;
      try {
        const result = await fn();
        ok = true;
        if (success) toast.success(typeof success === "function" ? success(result) : success);
        return result;
      } catch (err) {
        toast.error("Something went wrong", errorMessage(err));
        return undefined;
      } finally {
        setBusy(null);
        if (!(ok && leaving)) await refresh();
      }
    },
    [refresh, toast],
  );

  return { busy, run };
}
