import { Column } from "primereact/column";
import { DataTable, type DataTableExpandedRows } from "primereact/datatable";
import { useMemo, useState } from "react";
import type { BulkResult, StackSummary } from "../../../shared/types";
import { IconButton } from "../components/Button";
import { useConfirm } from "../components/Confirm";
import { ErrorBanner, NoItemFound, PageHeader } from "../components/Page";
import { PortLinks } from "../components/PortLinks";
import { SearchBar } from "../components/SearchBar";
import { ContainerStatus, StackStatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { api, type ContainerAction } from "../lib/api";
import { useAction } from "../lib/useAction";
import { usePolling } from "../lib/usePolling";
import { ContainerActions, ContainerName } from "./ContainersPage";
import { useContainerActions } from "../lib/useContainerActions";

const PAST: Record<ContainerAction | "remove", string> = {
  start: "started",
  stop: "stopped",
  restart: "restarted",
  remove: "deleted",
};

export function StacksPage() {
  const { data, error, loading, refresh } = usePolling(api.stacks, 3_000);
  const { busy, run } = useAction(refresh);
  const containerActions = useContainerActions(refresh);
  const confirm = useConfirm();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<DataTableExpandedRows>({});

  const rows = useMemo(
    () => (data ?? []).filter((s) => !query || s.name.toLowerCase().includes(query.toLowerCase())),
    [data, query],
  );

  /** Bulk calls succeed overall but may fail per container — report those. */
  const report = (name: string, verb: string, r: BulkResult) => {
    const failed = r.results.filter((x) => !x.ok);
    if (failed.length) {
      toast.error(`${failed.length} of ${r.results.length} container(s) failed`, failed.map((f) => `${f.name}: ${f.error}`).join("\n"));
    }
    return `${name} ${verb}`;
  };

  const stackAction = (s: StackSummary, action: ContainerAction) =>
    run(`${s.name}:${action}`, () => api.stackAction(s.name, action), (r) => report(s.name, PAST[action], r));

  const removeStack = async (s: StackSummary) => {
    const ok = await confirm({
      title: "Delete stack?",
      message: (
        <>
          All {s.total} container(s) of <b>{s.name}</b> will be stopped and removed. Images and volumes are kept, so{" "}
          <code>docker compose up</code> brings it back.
        </>
      ),
      action: "Delete",
      danger: true,
    });
    if (ok) await run(`${s.name}:remove`, () => api.removeStack(s.name), (r) => report(s.name, PAST.remove, r));
  };

  return (
    <>
      <PageHeader
        title="Stacks"
        subtitle="Docker Compose projects running on this machine."
        actions={<SearchBar value={query} onChange={setQuery} placeholder="Search stacks" />}
      />
      <ErrorBanner error={error} />
      <DataTable
        value={rows}
        dataKey="name"
        loading={loading && !data}
        expandedRows={expanded}
        onRowToggle={(e) => setExpanded(e.data as DataTableExpandedRows)}
        rowExpansionTemplate={(s: StackSummary) => (
          <div className="px-4 py-2">
            <table className="w-full text-sm">
              <tbody>
                {s.containers.map((c) => (
                  <tr key={c.id} className="border-b border-line-soft last:border-0">
                    <td className="py-3 pr-4">
                      <ContainerName c={c} />
                    </td>
                    <td className="py-3 pr-4 text-13 text-muted">{c.service}</td>
                    <td className="py-3 pr-4">
                      <ContainerStatus state={c.state} status={c.status} />
                    </td>
                    <td className="py-3 pr-4">
                      <PortLinks ports={c.ports} />
                    </td>
                    <td className="py-3">
                      <ContainerActions c={c} {...containerActions} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        emptyMessage={<NoItemFound message={query ? "No stacks match." : "No compose stacks yet. Run `docker compose up` in a repo."} />}
      >
        <Column expander style={{ width: 48 }} />
        <Column
          field="name"
          header="Stack"
          sortable
          body={(s: StackSummary) => (
            <div className="flex flex-col gap-1">
              <span className="font-medium text-ink">{s.name}</span>
              {s.workingDir && <span className="text-xs text-muted">{s.workingDir}</span>}
            </div>
          )}
        />
        <Column header="Status" body={(s: StackSummary) => <StackStatusBadge status={s.status} running={s.running} total={s.total} />} />
        <Column field="total" header="Containers" sortable />
        <Column
          header="Actions"
          style={{ width: 160 }}
          body={(s: StackSummary) => (
            <div className="flex items-center gap-1">
              {s.status === "stopped" ? (
                <IconButton icon="pi-play" label={`Start ${s.name}`} onClick={() => stackAction(s, "start")} disabled={busy !== null} />
              ) : (
                <IconButton icon="pi-stop" label={`Stop ${s.name}`} danger onClick={() => stackAction(s, "stop")} disabled={busy !== null} />
              )}
              <IconButton icon="pi-refresh" label={`Restart ${s.name}`} onClick={() => stackAction(s, "restart")} disabled={busy !== null} />
              <IconButton icon="pi-trash" label={`Delete ${s.name}`} danger onClick={() => removeStack(s)} disabled={busy !== null} />
            </div>
          )}
        />
      </DataTable>
    </>
  );
}
