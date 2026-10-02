import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-xl font-medium text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-13 text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = "" }: { title?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-line bg-white ${className}`}>
      {title && (
        <header className="flex items-center justify-between border-b border-line-soft px-5 py-4">
          <h2 className="text-sm font-medium text-ink">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function NoItemFound({ message = "No data available." }: { message?: string }) {
  return <p className="my-4 text-center text-sm text-gray-500 italic">{message}</p>;
}

export function ErrorBanner({ error }: { error: Error | string | undefined | null }) {
  if (!error) return null;
  const message = typeof error === "string" ? error : error.message;
  return (
    <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-[#FFC9D6] bg-[#FFEEF3] px-4 py-3 text-13 text-danger">
      <i className="pi pi-exclamation-circle" aria-hidden />
      {message}
    </div>
  );
}
