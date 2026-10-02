import clsx from "clsx";
import { Boxes, Container, Database, Eraser, HardDrive, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { DiskUsage } from "../../../shared/types";
import { Button } from "../components/Button";
import { useConfirm } from "../components/Confirm";
import { Card, ErrorBanner, PageHeader } from "../components/Page";
import { api } from "../lib/api";
import { formatBytes } from "../lib/format";
import { useAction } from "../lib/useAction";
import { usePolling } from "../lib/usePolling";

function StatTile({ label, value, detail, to, icon: Icon }: { label: string; value: string; detail?: string; to?: string; icon: LucideIcon }) {
  const body: ReactNode = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-13 text-grey">{label}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Icon size={16} strokeWidth={2} aria-hidden />
        </span>
      </div>
      <div className="mt-3 text-[28px] leading-none font-medium text-ink">{value}</div>
      {detail && <div className="mt-2 text-13 text-muted">{detail}</div>}
    </>
  );
  const base = "rounded-lg border border-line bg-white p-5";
  return to ? (
    <Link to={to} className={clsx(base, "transition-colors hover:border-primary")}>
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  );
}

const DISK_ROWS: { key: keyof Omit<DiskUsage, "total">; label: string }[] = [
  { key: "images", label: "Images" },
  { key: "containers", label: "Containers" },
  { key: "volumes", label: "Volumes" },
  { key: "buildCache", label: "Build cache" },
];

export function DashboardPage() {
  const system = usePolling(api.system, 5_000);
  const disk = usePolling(api.diskUsage, 20_000);
  const confirm = useConfirm();
  const { busy, run } = useAction(async () => {
    await Promise.all([system.refresh(), disk.refresh()]);
  });

  const s = system.data;
  const d = disk.data;

  const cleanUp = async () => {
    const ok = await confirm({
      title: "Clean up Docker?",
      message: (
        <>
          This removes <b>stopped containers</b>, <b>dangling images</b>, <b>unused networks</b> and the{" "}
          <b>build cache</b>. Volumes (your databases) are kept.
        </>
      ),
      action: "Clean up",
    });
    if (ok) await run("cleanup", api.cleanUp, (r) => `Cleaned up ${r.deleted} item(s), reclaimed ${formatBytes(r.reclaimed)}`);
  };

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Your local Docker engine at a glance." />
      <ErrorBanner error={system.error} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Containers"
          icon={Container}
          to="/containers"
          value={s ? String(s.containers.total) : "—"}
          detail={s ? `${s.containers.running} running · ${s.containers.stopped} stopped` : undefined}
        />
        <StatTile label="Images" icon={Boxes} to="/images" value={s ? String(s.images) : "—"} detail={d ? formatBytes(d.images.size) : undefined} />
        <StatTile
          label="Volumes"
          icon={Database}
          to="/volumes"
          value={d ? String(d.volumes.count) : "—"}
          detail={d ? formatBytes(d.volumes.size) : undefined}
        />
        <StatTile label="Disk used by Docker" icon={HardDrive} value={d ? formatBytes(d.total) : "—"} detail="Images, containers, volumes, cache" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card
          title="Disk usage"
          className="xl:col-span-2"
          actions={
            <Button size="sm" icon={Eraser} onClick={cleanUp} disabled={busy === "cleanup"}>
              {busy === "cleanup" ? "Cleaning…" : "Clean up"}
            </Button>
          }
        >
          <ErrorBanner error={disk.error} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-13 text-grey">
                  <th className="pb-3 font-normal">Type</th>
                  <th className="pb-3 font-normal">Count</th>
                  <th className="pb-3 font-normal">Size</th>
                  <th className="pb-3 font-normal">Reclaimable</th>
                </tr>
              </thead>
              <tbody>
                {DISK_ROWS.map(({ key, label }) => (
                  <tr key={key} className="border-t border-line-soft text-body">
                    <td className="py-3">{label}</td>
                    <td className="py-3">{d ? d[key].count : "—"}</td>
                    <td className="py-3">{d ? formatBytes(d[key].size) : "—"}</td>
                    <td className="py-3">{d ? formatBytes(d[key].reclaimable) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Engine">
          {s ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
              <dt className="text-grey">Docker</dt>
              <dd className="text-body">{s.serverVersion}</dd>
              <dt className="text-grey">Host</dt>
              <dd className="break-all text-body">{s.name}</dd>
              <dt className="text-grey">OS</dt>
              <dd className="text-body">{s.os}</dd>
              <dt className="text-grey">Kernel</dt>
              <dd className="font-mono text-12 break-all text-body">{s.kernelVersion}</dd>
              <dt className="text-grey">CPUs / memory</dt>
              <dd className="text-body">
                {s.cpus} · {formatBytes(s.memTotal)}
              </dd>
              <dt className="text-grey">Dockyard</dt>
              <dd className="font-mono text-12 text-body">{s.appVersion}</dd>
            </dl>
          ) : (
            <p className="text-13 text-muted">Loading…</p>
          )}
        </Card>
      </div>
    </>
  );
}
