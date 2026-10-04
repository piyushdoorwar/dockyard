import clsx from "clsx";
import { Boxes, Container, Database, Files, HardDrive, Layers, LayoutDashboard, type LucideIcon, Network, Cable, Settings } from "lucide-react";
import { NavLink } from "react-router";
import { Logo } from "./Logo";
import { useSettings } from "../lib/settings";

export const NAV_ITEMS: { to: string; label: string; icon: LucideIcon; end?: boolean; feature?: "agents" | "compose" }[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/containers", label: "Containers", icon: Container },
  { to: "/stacks", label: "Stacks", icon: Layers },
  { to: "/compose", label: "Compose", icon: Files, feature: "compose" },
  { to: "/networking", label: "Networking", icon: Cable },
  { to: "/images", label: "Images", icon: Boxes },
  { to: "/volumes", label: "Volumes", icon: Database },
  { to: "/agents", label: "Agents", icon: Network, feature: "agents" },
];

export function SideNav() {
  const { settings } = useSettings();
  return (
    // Floats off the edge like a hull: rounded, lifted by a soft shadow, with a
    // slightly heavier bottom edge. Contents are the same as a flat sidebar.
    <aside className="side-hull my-3 ml-3 flex w-14 shrink-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface md:w-56">
      <div className="flex items-center justify-center gap-2.5 px-3 pt-5 pb-4 md:justify-start md:px-5">
        <Logo size={30} />
        <span className="hidden text-[19px] font-bold tracking-tight text-ink md:inline">Dockyard</span>
      </div>
      <div className="hidden px-6 pt-3 pb-2 text-11 font-medium tracking-wide text-muted uppercase md:block">Workspace</div>
      <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto px-2 md:px-3">
        <ul className="grid gap-0.5">
          {NAV_ITEMS.filter((item) => !item.feature || settings[item.feature]).map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                title={label}
                className={({ isActive }) =>
                  clsx(
                    "flex h-10 items-center justify-center gap-3 rounded-md text-13 font-medium transition-colors md:justify-start md:px-3",
                    isActive ? "is-active bg-primary text-white" : "text-grey hover:bg-primary-soft hover:text-accent",
                  )
                }
              >
                <Icon size={17} strokeWidth={2} aria-hidden />
                <span className="sr-only md:not-sr-only">{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <nav aria-label="Preferences" className="mt-3 px-2 md:px-3">
        <NavLink to="/settings" title="Settings" className={({ isActive }) => clsx(
          "flex h-10 items-center justify-center gap-3 rounded-md text-13 font-medium transition-colors md:justify-start md:px-3",
          isActive ? "is-active bg-primary text-white" : "text-grey hover:bg-primary-soft hover:text-accent",
        )}>
          <Settings size={17} strokeWidth={2} aria-hidden />
          <span className="sr-only md:not-sr-only">Settings</span>
        </NavLink>
      </nav>
      <div className="m-3 flex items-center justify-center gap-2.5 rounded-lg border border-line px-3 py-2.5 md:justify-start" title="Dockyard only answers requests from this machine">
        <HardDrive size={15} className="shrink-0 text-accent" aria-hidden />
        <div className="hidden min-w-0 md:block">
          <p className="text-12 font-medium text-ink">Local only</p>
          <p className="text-11 text-muted">Nothing leaves this machine</p>
        </div>
      </div>
    </aside>
  );
}
