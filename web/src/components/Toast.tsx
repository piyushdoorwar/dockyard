import { Toast } from "primereact/toast";
import { createContext, type ReactNode, useContext, useMemo, useRef } from "react";

interface Notify {
  success: (summary: string, detail?: string) => void;
  error: (summary: string, detail?: string) => void;
}

const ToastContext = createContext<Notify | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const ref = useRef<Toast>(null);
  const notify = useMemo<Notify>(
    () => ({
      success: (summary, detail) => ref.current?.show({ severity: "success", summary, detail, life: 3500 }),
      error: (summary, detail) => ref.current?.show({ severity: "error", summary, detail, life: 7000 }),
    }),
    [],
  );
  return (
    <ToastContext.Provider value={notify}>
      <Toast ref={ref} position="top-right" />
      {children}
    </ToastContext.Provider>
  );
}

export function useToast(): Notify {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
