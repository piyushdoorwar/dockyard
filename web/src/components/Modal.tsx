import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  title?: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  width?: number;
}

/** Shared modal shell: header with a close button, scrolling body, footer actions. */
export function Modal({ title, subtitle, children, footer, onClose, width = 460 }: ModalProps) {
  const dialog = useRef<HTMLDivElement>(null);
  // Capture before child autoFocus runs during the commit.
  const opener = useRef(document.activeElement as HTMLElement | null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previousFocus = opener.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(dialog.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
    ) ?? []).filter((el) => !el.closest('[hidden], [aria-hidden="true"]'));
    if (!dialog.current?.contains(document.activeElement)) (focusable()[0] ?? dialog.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close.current();
      } else if (e.key === "Tab") {
        const items = focusable();
        const first = items[0];
        const last = items.at(-1);
        if (!first) {
          e.preventDefault();
          dialog.current?.focus();
        } else if (!dialog.current?.contains(document.activeElement) || document.activeElement === dialog.current ||
          (e.shiftKey ? document.activeElement === first : document.activeElement === last)) {
          e.preventDefault();
          (e.shiftKey ? last : first)?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay/40 p-4" onMouseDown={onClose}>
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[90vh] w-full flex-col rounded-lg bg-surface shadow-xl"
        style={{ maxWidth: width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title && (
          <header className="flex items-start justify-between gap-4 border-b border-line-soft px-6 py-4">
            <div>
              <h2 className="text-base font-medium text-ink">{title}</h2>
              {subtitle && <p className="mt-0.5 text-13 text-muted">{subtitle}</p>}
            </div>
            <button type="button" aria-label="Close" onClick={onClose} className="-mr-2 rounded-md p-1 text-muted hover:bg-line-soft hover:text-ink">
              <X size={18} aria-hidden />
            </button>
          </header>
        )}
        <div className="min-h-0 overflow-y-auto px-6 py-5 text-sm text-body">{children}</div>
        {footer && <footer className="flex justify-end gap-3 border-t border-line-soft px-6 py-4">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
