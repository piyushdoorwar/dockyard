import { RefreshCw } from "lucide-react";
import type { ContainerDiagnostics } from "../../../../shared/types";
import { Button } from "../Button";
import { Card, ErrorBanner } from "../Page";
import { Badge } from "../StatusBadge";
import { api } from "../../lib/api";
import { usePolling } from "../../lib/usePolling";

function when(value: string | null): string {
  if (!value || value.startsWith("0001-")) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function failureSignals(data: ContainerDiagnostics): string[] {
  const signals: string[] = [];
  if (data.oomKilled) signals.push("Docker reports an out-of-memory kill.");
  if (data.exitCode !== 0 && data.status === "exited") signals.push(`The process exited with code ${data.exitCode}.`);
  if (data.status === "dead") signals.push("Docker reports this container as dead.");
  if (data.status === "restarting") signals.push("The container is restarting.");
  if (data.status === "running" && data.health?.status === "unhealthy") signals.push("The health check is failing.");
  if (data.engineError) signals.push(`Docker reported: ${data.engineError}`);
  return signals;
}

function Datum({ label, value }: { label: string; value: string | number }) {
  return <div className="min-w-0 rounded-md bg-canvas px-4 py-3"><dt className="text-12 text-muted">{label}</dt><dd className="mt-1 break-words font-medium text-ink">{value}</dd></div>;
}

function Details({ data, onShowLogs }: { data: ContainerDiagnostics; onShowLogs: () => void }) {
  const signals = failureSignals(data);
  return <div className="space-y-5">
    <Card title="Failure signals">
      {signals.length ? <ul className="space-y-2 text-13 text-body">{signals.map(s => <li key={s} className="rounded-md bg-danger-soft px-3 py-2 text-danger">{s}</li>)}</ul>
        : <p className="text-13 text-muted">Docker reports no clear failure signal in the current state. Check the health output and recent logs below for more context.</p>}
    </Card>
    <Card title="Container state">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Datum label="Status" value={data.status} />
        <Datum label="Exit code" value={data.exitCode} />
        <Datum label="OOM killed" value={data.oomKilled ? "Yes" : "No"} />
        <Datum label="Restart count" value={data.restartCount} />
        <Datum label="Last started" value={when(data.startedAt)} />
        <Datum label="Last finished" value={when(data.finishedAt)} />
      </dl>
      <p className="mt-3 text-12 text-muted">These values describe Docker's current container state; they may not identify the root cause by themselves.</p>
    </Card>
    <Card title="Health checks">
      {!data.health ? <p className="text-13 text-muted">No health check is configured for this container.</p> : <>
        <div className="mb-4 flex flex-wrap items-center gap-3"><Badge tone={data.health.status === "healthy" ? "success" : data.health.status === "unhealthy" ? "danger" : "warning"}>{data.status === "running" ? data.health.status : `Last reported: ${data.health.status}`}</Badge><span className="text-13 text-grey">Failing streak: {data.health.failingStreak}</span></div>
        {!data.health.checks.length ? <p className="text-13 text-muted">No health check results yet.</p> : <div className="space-y-3">{data.health.checks.map((check, i) => <div key={`${check.startedAt}-${i}`} className="rounded-md border border-line p-3 text-13">
          <p className="text-grey">{when(check.startedAt)} · Exit code {check.exitCode}</p>
          {check.output && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-12 text-body">{check.output}</pre>}
        </div>)}</div>}
      </>}
    </Card>
    <Card title="Recent logs" actions={<Button variant="ghost" size="sm" onClick={onShowLogs}>Open live logs</Button>}>
      {data.logError && <p className="mb-3 text-13 text-warning">{data.logError}</p>}
      {!data.logs.length ? <p className="text-13 text-muted">No recent log lines available.</p> : <div role="log" className="max-h-80 overflow-auto rounded-md bg-canvas p-3 font-mono text-12">
        {data.logs.map((line, i) => <div key={`${line.ts}-${i}`} className={`whitespace-pre-wrap break-all ${line.stream === "stderr" ? "text-danger" : "text-body"}`}><span className="mr-2 text-muted">{line.ts ? when(line.ts) : ""}</span>{line.text}</div>)}
      </div>}
      <p className="mt-3 text-12 text-muted">A short excerpt from Docker's latest logs. Open Logs for a longer live stream.</p>
    </Card>
  </div>;
}

export function DiagnosticsView({ containerId, onShowLogs }: { containerId: string; onShowLogs: () => void }) {
  const { data, error, loading, refresh } = usePolling(() => api.containerDiagnostics(containerId), 8_000);
  return <>
    <div className="mb-4 flex items-center justify-between gap-3"><p className="text-13 text-muted">Current Docker evidence for this container.</p><Button variant="cancel" size="sm" icon={RefreshCw} onClick={refresh}>Refresh</Button></div>
    <ErrorBanner error={error} />
    {loading && !data ? <p className="text-13 text-muted">Loading diagnostics…</p> : data && <Details data={data} onShowLogs={onShowLogs} />}
  </>;
}
