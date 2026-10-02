import { Play, RotateCw, Square, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { BulkResult, StackSummary } from "../../../shared/types";
import { IconButton } from "../components/Button";
import { useConfirm } from "../components/Confirm";
import { type Column, DataTable } from "../components/DataTable";
import { ErrorBanner, NoItemFound, PageHeader } from "../components/Page";
import { PortLinks } from "../components/PortLinks";
import { SearchBar } from "../components/SearchBar";
import { ContainerStatus, StackStatusBadge } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { api, type ContainerAction } from "../lib/api";
import { useAction } from "../lib/useAction";
import { usePolling } from "../lib/usePolling";
import { useContainerActions } from "../lib/useContainerActions";
import { ContainerActions, ContainerName } from "./ContainersPage";

const SELF_STACK_REASON = "This stack runs Dockyard itself. Manage it from your host terminal.";

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

  const columns: Column<StackSummary>[] = [
    {
      key: "name",
      header: "Stack",
      minWidth: 220,
      sortValue: (s) => s.name,
      render: (s) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-ink">{s.name}</span>
          {s.workingDir && <span className="font-mono text-12 break-all text-muted">{s.workingDir}</span>}
        </div>
      ),
    },
    { key: "status", header: "Status", sortValue: (s) => s.running / Math.max(1, s.total), render: (s) => <StackStatusBadge status={s.status} running={s.running} total={s.total} /> },
    { key: "total", header: "Containers", sortValue: (s) => s.total, render: (s) => s.total },
    {
      key: "actions",
      header: "Actions",
      width: 132,
      render: (s) => {
        // Stopping or deleting the stack Dockyard runs in would take the UI down with it.
        const self = s.containers.some((c) => c.isSelf) ? SELF_STACK_REASON : undefined;
        return (
          <div className="flex items-center gap-1">
            {s.status === "stopped" ? (
              <IconButton icon={Play} label={`Start ${s.name}`} onClick={() => stackAction(s, "start")} disabled={busy !== null} />
            ) : (
              <IconButton icon={Square} label={`Stop ${s.name}`} danger onClick={() => stackAction(s, "stop")} disabled={!!self || busy !== null} disabledReason={self} />
            )}
            <IconButton icon={RotateCw} label={`Restart ${s.name}`} onClick={() => stackAction(s, "restart")} disabled={!!self || busy !== null} disabledReason={self} />
            <IconButton icon={Trash2} label={`Delete ${s.name}`} danger onClick={() => removeStack(s)} disabled={!!self || busy !== null} disabledReason={self} />
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Stacks"
        subtitle="Docker Compose projects running on this machine."
        actions={<SearchBar value={query} onChange={setQuery} placeholder="Search stacks" />}
      />
      <ErrorBanner error={error} />
      <DataTable
        rows={rows}
        rowKey={(s) => s.name}
        columns={columns}
        loading={loading && !data}
        defaultSort={{ key: "name", dir: "asc" }}
        expandLabel={(s) => `Containers of ${s.name}`}
        expansion={(s) =>
          s.containers.length === 0 ? (
            <p className="py-3 text-13 text-muted">No containers left in this stack.</p>
          ) : (
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
          )
        }
        empty={<NoItemFound message={query ? "No stacks match." : "No Compose stacks yet."} hint={query ? undefined : "Run docker compose up in a project and it shows up here."} />}
      />
    </>
  );
}
