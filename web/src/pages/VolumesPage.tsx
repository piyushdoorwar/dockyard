import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";
import { useMemo, useState } from "react";
import type { VolumeSummary } from "../../../shared/types";
import { Button, IconButton } from "../components/Button";
import { useConfirm } from "../components/Confirm";
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

  return (
    <>
      <PageHeader
        title="Volumes"
        subtitle="Persistent data used by containers."
        actions={
          <>
            <SearchBar value={query} onChange={setQuery} placeholder="Search volumes" />
            <Button variant="cancel" icon="pi-trash" onClick={prune} disabled={busy !== null}>
              Remove unused
            </Button>
          </>
        }
      />
      <ErrorBanner error={error} />
      <DataTable value={rows} dataKey="name" loading={loading && !data} emptyMessage={<NoItemFound message={query ? "No volumes match." : "No volumes yet."} />}>
        <Column field="name" header="Name" sortable body={(v: VolumeSummary) => <span className="font-medium break-all text-ink">{v.name}</span>} />
        <Column field="project" header="Stack" sortable body={(v: VolumeSummary) => <span className="text-13">{v.project ?? "—"}</span>} />
        <Column
          field="refCount"
          header="Status"
          sortable
          body={(v: VolumeSummary) =>
            v.refCount === null ? <span className="text-muted">—</span> : v.refCount > 0 ? <Badge tone="success">In use</Badge> : <Badge tone="neutral">Unused</Badge>
          }
        />
        <Column field="size" header="Size" sortable body={(v: VolumeSummary) => <span className="text-13">{formatBytes(v.size)}</span>} />
        <Column field="created" header="Created" sortable body={(v: VolumeSummary) => <span className="text-13">{timeAgo(v.created)}</span>} />
        <Column
          header="Actions"
          style={{ width: 90 }}
          body={(v: VolumeSummary) => <IconButton icon="pi-trash" label={`Delete ${v.name}`} danger onClick={() => remove(v)} disabled={busy !== null} />}
        />
      </DataTable>
    </>
  );
}
