import clsx from "clsx";
import { NavLink } from "react-router";

export const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: "pi-th-large", end: true },
  { to: "/containers", label: "Containers", icon: "pi-box" },
  { to: "/stacks", label: "Stacks", icon: "pi-sitemap" },
  { to: "/images", label: "Images", icon: "pi-clone" },
  { to: "/volumes", label: "Volumes", icon: "pi-database" },
  { to: "/agents", label: "Agents", icon: "pi-sitemap" },
] as const;

export function SideNav() {
  return (
    <aside className="dock-nav">
      <div className="dock-brand">
        <img src="/dockyard.svg" alt="" width={38} height={38} />
        <div><strong>Dockyard</strong><span>Local runtime</span></div>
      </div>
      <div className="dock-nav-label">Workspace</div>
      <nav aria-label="Main" className="dock-nav-scroll">
        <ul className="dock-nav-list">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={"end" in item ? item.end : false}
                className={({ isActive }) =>
                  clsx(
                    "dock-nav-link",
                    isActive
                      ? "is-active"
                      : "",
                  )
                }
              >
                <i className={clsx("pi", item.icon)} aria-hidden />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="dock-nav-footer">
        <span className="dock-pulse" aria-hidden />
        <div><strong>Local only</strong><span>Your data stays here</span></div>
      </div>
    </aside>
  );
}
