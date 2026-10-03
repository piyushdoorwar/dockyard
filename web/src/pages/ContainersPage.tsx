import { Play, RotateCw, Square, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { ContainerSummary } from "../../../shared/types";
import { IconButton } from "../components/Button";
import { type Column, DataTable } from "../components/DataTable";
import { ErrorBanner, NoItemFound, PageHeader } from "../components/Page";
import { PortLinks } from "../components/PortLinks";
import { SearchBar, Toggle } from "../components/SearchBar";
import { ContainerStatus } from "../components/StatusBadge";
import { exitCode } from "../lib/format";
import { api } from "../lib/api";
import { timeAgo } from "../lib/format";
import { SELF_REASON, useContainerActions } from "../lib/useContainerActions";
import { usePolling } from "../lib/usePolling";

export function matchesSearch(c: ContainerSummary, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [c.name, c.image, c.project ?? "", c.service ?? "", c.shortId].some((f) => f.toLowerCase().includes(needle));
}

export function ContainerActions({ c, busy, act, remove }: { c: ContainerSummary } & ReturnType<typeof useContainerActions>) {
  // A container stuck restarting is "up" for our purposes: offer Stop, not Start.
  const running = c.state === "running" || c.state === "restarting";
  const self = c.isSelf ? SELF_REASON : undefined;
  return (
    <div className="flex items-center gap-1">
      {running ? (
        <IconButton icon={Square} label={`Stop ${c.name}`} danger onClick={() => act(c, "stop")} disabled={!!self || busy !== null} disabledReason={self} />
      ) : (
        <IconButton icon={Play} label={`Start ${c.name}`} onClick={() => act(c, "start")} disabled={busy !== null} />
      )}
      <IconButton icon={RotateCw} label={`Restart ${c.name}`} onClick={() => act(c, "restart")} disabled={!!self || busy !== null} disabledReason={self} />
      <IconButton icon={Trash2} label={`Delete ${c.name}`} danger onClick={() => remove(c)} disabled={!!self || busy !== null} disabledReason={self} />
    </div>
  );
}

export function ContainerName({ c }: { c: ContainerSummary }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-2">
        <Link to={`/containers/${c.id}`} className="font-medium [overflow-wrap:anywhere] text-accent hover:underline">
          {c.name}
        </Link>
        {c.isSelf && <span className="shrink-0 rounded whitespace-nowrap bg-primary-soft px-1.5 py-0.5 text-11 font-medium text-accent">this app</span>}
      </span>
      {(c.state === "dead" || c.state === "restarting" || /\(unhealthy\)/.test(c.status) || (c.state === "exited" && (exitCode(c.status) ?? 0) !== 0)) && <Link to={`/containers/${c.id}?tab=diagnostics`} className="text-12 text-accent hover:underline">View diagnostics</Link>}
      <span className="text-12 text-muted">
        <span className="font-mono">{c.shortId}</span>
        {c.project && (
          <>
            {" · "}
            <Link to="/stacks" className="hover:text-accent">
              {c.project}
            </Link>
          </>
        )}
      </span>
    </div>
  );
}

export function ContainersPage() {
  const { data, error, loading, refresh } = usePolling(api.containers, 3_000);
  const actions = useContainerActions(refresh);
  const [query, setQuery] = useState("");
  const [onlyRunning, setOnlyRunning] = useState(false);

  const rows = useMemo(
    () => (data ?? []).filter((c) => (!onlyRunning || c.state === "running") && matchesSearch(c, query)),
    [data, onlyRunning, query],
  );
  const running = (data ?? []).filter((c) => c.state === "running").length;

  const columns: Column<ContainerSummary>[] = [
    { key: "name", header: "Name", minWidth: 200, sortValue: (c) => c.name, render: (c) => <ContainerName c={c} /> },
    { key: "image", header: "Image", minWidth: 180, sortValue: (c) => c.image, render: (c) => <span className="text-13 [overflow-wrap:anywhere]">{c.image}</span> },
    { key: "state", header: "Status", sortValue: (c) => c.state, render: (c) => <ContainerStatus state={c.state} status={c.status} /> },
    { key: "ports", header: "Port(s)", render: (c) => <PortLinks ports={c.ports} /> },
    { key: "created", header: "Created", sortValue: (c) => c.created, render: (c) => <span className="text-13 whitespace-nowrap">{timeAgo(c.created)}</span> },
    { key: "actions", header: "Actions", width: 132, render: (c) => <ContainerActions c={c} {...actions} /> },
  ];

  return (
    <>
      <PageHeader
        title="Containers"
        subtitle={data ? `${running} running of ${data.length}` : undefined}
        actions={
          <>
            <Toggle checked={onlyRunning} onChange={setOnlyRunning} label="Only show running" />
            <SearchBar value={query} onChange={setQuery} placeholder="Search containers" />
          </>
        }
      />
      <ErrorBanner error={error} />
      <DataTable
        rows={rows}
        rowKey={(c) => c.id}
        columns={columns}
        loading={loading && !data}
        defaultSort={{ key: "name", dir: "asc" }}
        empty={<NoItemFound message={query || onlyRunning ? "No containers match." : "No containers yet."} />}
      />
    </>
  );
}
