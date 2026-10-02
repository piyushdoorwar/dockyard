import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { PortMapping } from "../../../shared/types";
import { Button } from "../components/Button";
import { InspectView } from "../components/container/InspectView";
import { LogsView } from "../components/container/LogsView";
import { StatsView } from "../components/container/StatsView";
import { TerminalView } from "../components/container/TerminalView";
import { ErrorBanner, PageHeader } from "../components/Page";
import { PortLinks } from "../components/PortLinks";
import { ContainerStatus } from "../components/StatusBadge";
import { TabButton } from "../components/TabButton";
import { api, type ContainerInspect } from "../lib/api";
import { SELF_REASON, useContainerActions } from "../lib/useContainerActions";
import { usePolling } from "../lib/usePolling";

type TabId = "logs" | "inspect" | "terminal" | "stats";
const TABS: { id: TabId; label: string }[] = [
  { id: "logs", label: "Logs" },
  { id: "inspect", label: "Inspect" },
  { id: "terminal", label: "Terminal" },
  { id: "stats", label: "Stats" },
];

export function portsFromInspect(info: ContainerInspect): PortMapping[] {
  const out: PortMapping[] = [];
  for (const [key, bindings] of Object.entries(info.NetworkSettings?.Ports ?? {})) {
    const [port, type] = key.split("/");
    const seen = new Set<string>();
    for (const b of bindings ?? []) {
      if (seen.has(b.HostPort)) continue;
      seen.add(b.HostPort);
      out.push({ privatePort: Number(port), publicPort: Number(b.HostPort), type, ip: b.HostIp });
    }
  }
  return out;
}

/** Rebuild Docker's list-style status text from inspect, so the badge matches the Containers page. */
export function statusText(info: ContainerInspect): string | undefined {
  const health = info.State.Health?.Status;
  if (info.State.Running && health && health !== "none") return `Up (${health === "starting" ? "health: starting" : health})`;
  if (info.State.Status === "exited") return `Exited (${info.State.ExitCode ?? 0})`;
  return undefined;
}

export function ContainerDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: info, error, refresh } = usePolling(() => api.inspectContainer(id), 4_000);
  const { busy, act, remove } = useContainerActions(refresh);
  const [tab, setTab] = useState<TabId>("logs");

  if (!info) {
    return (
      <>
        <Link to="/containers" className="text-13 text-primary hover:underline">
          ← Containers
        </Link>
        <div className="mt-4">{error ? <ErrorBanner error={error} /> : <p className="text-13 text-muted">Loading…</p>}</div>
      </>
    );
  }

  const name = info.Name.replace(/^\//, "");
  const running = info.State.Running || info.State.Status === "restarting";
  const self = info.Config.Labels?.["com.dockyard.runtime"] === "true";
  const c = { id: info.Id, name };
  const project = info.Config.Labels?.["com.docker.compose.project"];

  return (
    <>
      <Link to="/containers" className="text-13 text-primary hover:underline">
        ← Containers
      </Link>
      <div className="mt-3">
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              {name} <ContainerStatus state={info.State.Status} status={statusText(info)} />
            </span>
          }
          subtitle={
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>{info.Config.Image}</span>
              <span>{info.Id.slice(0, 12)}</span>
              {project && <span>Stack: {project}</span>}
              <PortLinks ports={portsFromInspect(info)} />
            </span>
          }
          actions={
            <>
              {running ? (
                <Button variant="danger-outline" icon="pi-stop" onClick={() => act(c, "stop")} disabled={self || busy !== null} title={self ? SELF_REASON : undefined}>
                  Stop
                </Button>
              ) : (
                <Button variant="cancel" icon="pi-play" onClick={() => act(c, "start")} disabled={busy !== null}>
                  Start
                </Button>
              )}
              <Button variant="cancel" icon="pi-refresh" onClick={() => act(c, "restart")} disabled={self || busy !== null} title={self ? SELF_REASON : undefined}>
                Restart
              </Button>
              <Button
                variant="delete"
                icon="pi-trash"
                disabled={self || busy !== null}
                title={self ? SELF_REASON : undefined}
                onClick={async () => {
                  if (await remove(c)) navigate("/containers");
                }}
              >
                Delete
              </Button>
            </>
          }
        />
      </div>
      <ErrorBanner error={error} />
      <TabButton tabs={TABS} active={tab} onChange={setTab} />
      <div className="mt-5">
        {tab === "logs" && <LogsView containerId={info.Id} />}
        {tab === "inspect" && <InspectView info={info} />}
        {tab === "terminal" &&
          (running ? <TerminalView containerId={info.Id} /> : <p className="text-13 text-muted">Start the container to open a terminal.</p>)}
        {tab === "stats" && (running ? <StatsView containerId={info.Id} /> : <p className="text-13 text-muted">Start the container to see live stats.</p>)}
      </div>
    </>
  );
}
