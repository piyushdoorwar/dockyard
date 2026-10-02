import { Eraser, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { VolumeSummary } from "../../../shared/types";
import { Button, IconButton } from "../components/Button";
import { useConfirm } from "../components/Confirm";
import { type Column, DataTable } from "../components/DataTable";
import { ErrorBanner, NoItemFound, PageHeader } from "../components/Page";
import { SearchBar } from "../components/SearchBar";
import { Badge } from "../components/StatusBadge";
import { api } from "../lib/api";
import { formatBytes, timeAgo } from "../lib/format";
import { useAction } from "../lib/useAction";
import { usePolling } from "../lib/usePolling";

export function VolumesPage() {
  const { data, error, loading, refresh } = usePolling(api.volumes, 10_000);
  const { busy, run } = useAction(refresh);
  const confirm = useConfirm();
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const q = query.toLowerCase();
    return (data ?? []).filter((v) => !q || `${v.name} ${v.project ?? ""}`.toLowerCase().includes(q));
  }, [data, query]);

  const remove = async (v: VolumeSummary) => {
    const ok = await confirm({
      title: "Delete volume?",
      message: (
        <>
          <b>{v.name}</b> and <b>all data in it</b> (e.g. a local database) will be permanently deleted.
        </>
      ),
      action: "Delete",
      danger: true,
    });
    if (ok) await run(`${v.name}:remove`, () => api.removeVolume(v.name), `${v.name} deleted`);
  };

  const prune = async () => {
    const ok = await confirm({
      title: "Remove unused volumes?",
      message: "Every volume not used by a container — including data from stacks you've deleted — will be permanently deleted.",
      action: "Remove unused",
      danger: true,
    });
    if (ok) await run("prune", api.pruneVolumes, (r) => `Removed ${r.deleted} volume(s), reclaimed ${formatBytes(r.reclaimed)}`);
  };

  const columns: Column<VolumeSummary>[] = [
    { key: "name", header: "Name", minWidth: 220, sortValue: (v) => v.name, render: (v) => <span className="font-medium [overflow-wrap:anywhere] text-ink">{v.name}</span> },
    { key: "project", header: "Stack", sortValue: (v) => v.project, render: (v) => <span className="text-13">{v.project ?? "—"}</span> },
    {
      key: "status",
      header: "Status",
      sortValue: (v) => v.refCount,
      render: (v) =>
        v.refCount === null ? <span className="text-muted">—</span> : v.refCount > 0 ? <Badge tone="success">In use</Badge> : <Badge tone="neutral">Unused</Badge>,
    },
    { key: "size", header: "Size", sortValue: (v) => v.size, render: (v) => <span className="text-13 whitespace-nowrap">{formatBytes(v.size)}</span> },
    { key: "created", header: "Created", sortValue: (v) => v.created, render: (v) => <span className="text-13 whitespace-nowrap">{timeAgo(v.created)}</span> },
    { key: "actions", header: "Actions", width: 90, render: (v) => <IconButton icon={Trash2} label={`Delete ${v.name}`} danger onClick={() => remove(v)} disabled={busy !== null} /> },
  ];

  return (
    <>
      <PageHeader
        title="Volumes"
        subtitle="Persistent data used by containers."
        actions={
          <>
            <SearchBar value={query} onChange={setQuery} placeholder="Search volumes" />
            <Button variant="cancel" icon={Eraser} onClick={prune} disabled={busy !== null}>
              Remove unused
            </Button>
          </>
        }
      />
      <ErrorBanner error={error} />
      <DataTable
        rows={rows}
        rowKey={(v) => v.name}
        columns={columns}
        loading={loading && !data}
        defaultSort={{ key: "name", dir: "asc" }}
        empty={<NoItemFound message={query ? "No volumes match." : "No volumes yet."} />}
      />
    </>
  );
}
