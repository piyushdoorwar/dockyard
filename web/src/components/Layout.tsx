import { Outlet } from "react-router";
import { api } from "../lib/api";
import { usePolling } from "../lib/usePolling";
import { SideNav } from "./SideNav";

/** A thin status bar along the bottom edge, like an IDE's. */
function StatusBar() {
  const { data, error } = usePolling(api.system, 10_000);
  return (
    <footer className="flex h-7 shrink-0 items-center justify-between gap-4 border-t border-line bg-surface px-3 text-12 text-grey sm:px-4">
      {error ? (
        <span className="flex min-w-0 items-center gap-2 text-danger" title={error.message}>
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" aria-hidden />
          <span className="truncate">Docker engine unreachable</span>
        </span>
      ) : data ? (
        <span className="flex min-w-0 items-center gap-2">
          <span className="live-dot h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
          <span className="truncate">Engine running · Docker {data.serverVersion}</span>
        </span>
      ) : (
        <span className="text-muted">Connecting to Docker</span>
      )}
      {data && <span className="shrink-0 text-muted">Dockyard {data.appVersion}</span>}
    </footer>
  );
}

export function Layout() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas">
      <div className="flex min-h-0 flex-1">
        <SideNav />
        <main className="min-w-0 flex-1 overflow-y-auto px-4 pt-7 pb-14 sm:px-6 lg:px-10">
          <Outlet />
        </main>
      </div>
      <StatusBar />
    </div>
  );
}
