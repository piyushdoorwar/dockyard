import { Outlet } from "react-router";
import { api } from "../lib/api";
import { usePolling } from "../lib/usePolling";
import { SideNav } from "./SideNav";

function EngineStatus() {
  const { data, error } = usePolling(api.system, 10_000);
  if (error) {
    return (
      <span className="flex items-center gap-2 text-13 text-danger" title={error.message}>
        <span className="h-2 w-2 rounded-full bg-danger" /> Docker engine unreachable
      </span>
    );
  }
  if (!data) return null;
  return (
    <span className="flex items-center gap-2 text-13 text-grey">
      <span className="h-2 w-2 rounded-full bg-[#17C653]" aria-hidden />
      Engine running · Docker {data.serverVersion}
    </span>
  );
}

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      <SideNav />
      <div className="flex min-w-0 grow flex-col">
        <header className="dock-topbar">
          <div><span className="dock-breadcrumb">Dockyard</span><span className="dock-slash">/</span><span>Runtime overview</span></div>
          <EngineStatus />
        </header>
        <main className="flex-1 overflow-y-auto bg-canvas px-6 pt-7 pb-14 lg:px-10">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
