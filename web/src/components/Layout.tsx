import { Outlet, useLocation } from "react-router";
import { api } from "../lib/api";
import { usePolling } from "../lib/usePolling";
import { NAV_ITEMS, SideNav } from "./SideNav";

function EngineStatus() {
  const { data, error } = usePolling(api.system, 10_000);
  if (error) {
    return (
      <span className="flex items-center gap-2 text-13 text-danger" title={error.message}>
        <span className="h-2 w-2 rounded-full bg-danger" aria-hidden />
        <span className="hidden sm:inline">Docker engine unreachable</span>
      </span>
    );
  }
  if (!data) return null;
  return (
    <span className="flex items-center gap-2 text-13 text-grey">
      <span className="live-dot h-2 w-2 rounded-full bg-accent" aria-hidden />
      <span className="hidden sm:inline">Engine running · Docker {data.serverVersion}</span>
    </span>
  );
}

function sectionTitle(pathname: string): string {
  const item = NAV_ITEMS.find((n) => (n.end ? pathname === n.to : pathname === n.to || pathname.startsWith(`${n.to}/`)));
  return item?.label ?? "Not found";
}

export function Layout() {
  const { pathname } = useLocation();
  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <SideNav />
      <div className="flex min-w-0 grow flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-4 sm:px-6 lg:px-10">
          <div className="flex min-w-0 items-center gap-2 text-13 text-grey">
            <span className="hidden font-medium text-ink sm:inline">Dockyard</span>
            <span className="hidden text-muted sm:inline" aria-hidden>
              /
            </span>
            <span className="truncate">{sectionTitle(pathname)}</span>
          </div>
          <EngineStatus />
        </header>
        <main className="flex-1 overflow-y-auto px-4 pt-7 pb-14 sm:px-6 lg:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
