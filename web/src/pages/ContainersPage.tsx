import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { ContainerSummary } from "../../../shared/types";
import { IconButton } from "../components/Button";
import { ErrorBanner, NoItemFound, PageHeader } from "../components/Page";
import { PortLinks } from "../components/PortLinks";
import { SearchBar, Toggle } from "../components/SearchBar";
import { ContainerStatus } from "../components/StatusBadge";
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
        <IconButton icon="pi-stop" label={`Stop ${c.name}`} danger onClick={() => act(c, "stop")} disabled={!!self || busy !== null} disabledReason={self} />
      ) : (
        <IconButton icon="pi-play" label={`Start ${c.name}`} onClick={() => act(c, "start")} disabled={busy !== null} />
      )}
      <IconButton icon="pi-refresh" label={`Restart ${c.name}`} onClick={() => act(c, "restart")} disabled={!!self || busy !== null} disabledReason={self} />
      <IconButton icon="pi-trash" label={`Delete ${c.name}`} danger onClick={() => remove(c)} disabled={!!self || busy !== null} disabledReason={self} />
    </div>
  );
}

export function ContainerName({ c }: { c: ContainerSummary }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-2">
        <Link to={`/containers/${c.id}`} className="font-medium text-primary hover:underline">
          {c.name}
        </Link>
        {c.isSelf && <span className="rounded bg-customBgColor-grey px-1.5 py-0.5 text-[11px] text-primary">this app</span>}
      </span>
      <span className="text-xs text-muted">
        {c.shortId}
        {c.project && (
          <>
            {" · "}
            <Link to="/stacks" className="hover:text-primary">
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
        value={rows}
        dataKey="id"
        loading={loading && !data}
        emptyMessage={<NoItemFound message={query || onlyRunning ? "No containers match." : "No containers yet."} />}
        sortField="name"
        sortOrder={1}
        removableSort
      >
        <Column field="name" header="Name" sortable body={(c: ContainerSummary) => <ContainerName c={c} />} />
        <Column field="image" header="Image" sortable body={(c: ContainerSummary) => <span className="text-13">{c.image}</span>} />
        <Column field="state" header="Status" sortable body={(c: ContainerSummary) => <ContainerStatus state={c.state} status={c.status} />} />
        <Column header="Port(s)" body={(c: ContainerSummary) => <PortLinks ports={c.ports} />} />
        <Column field="created" header="Created" sortable body={(c: ContainerSummary) => <span className="text-13">{timeAgo(c.created)}</span>} />
        <Column header="Actions" body={(c: ContainerSummary) => <ContainerActions c={c} {...actions} />} style={{ width: 140 }} />
      </DataTable>
    </>
  );
}
