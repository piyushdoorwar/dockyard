import { CircleAlert, Inbox } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions, icon }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">{icon}</span>}
        <div className="min-w-0">
          <h1 className="text-xl font-medium break-words text-ink">{title}</h1>
          {subtitle && <div className="mt-0.5 text-13 text-muted">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = "", flush }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={`min-w-0 rounded-lg border border-line bg-white ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-3.5">
          <h2 className="text-sm font-medium text-ink">{title}</h2>
          {actions}
        </header>
      )}
      <div className={flush ? "" : "p-5"}>{children}</div>
    </section>
  );
}

export function NoItemFound({ message = "No data available.", hint }: { message?: string; hint?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <Inbox size={22} className="text-[#a7c4b2]" aria-hidden />
      <p className="text-13 text-grey">{message}</p>
      {hint && <p className="text-12 text-muted">{hint}</p>}
    </div>
  );
}

export function ErrorBanner({ error }: { error: Error | string | undefined | null }) {
  if (!error) return null;
  const message = typeof error === "string" ? error : error.message;
  return (
    <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-danger-line bg-danger-soft px-4 py-3 text-13 text-danger">
      <CircleAlert size={15} className="mt-px shrink-0" aria-hidden />
      <span className="min-w-0 break-words">{message}</span>
    </div>
  );
}

