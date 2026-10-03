import { Copy, Files, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import type { ComposeProject, ComposeService } from "../../../shared/types";
import { Button } from "../components/Button";
import { DataTable, type Column } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { Card, ErrorBanner, NoItemFound, PageHeader } from "../components/Page";
import { SearchBar, Toggle } from "../components/SearchBar";
import { Badge, ContainerStatus } from "../components/StatusBadge";
import { useToast } from "../components/Toast";
import { api } from "../lib/api";
import { usePolling } from "../lib/usePolling";

function quote(value: string): string { return `'${value.replaceAll("'", "'\\''")}'`; }
export function composeCommand(project: ComposeProject, profiles: string[]): string {
  return ["docker compose", ...project.selectedFiles.map((file) => `-f ${quote(file)}`),
    ...profiles.map((profile) => `--profile ${quote(profile)}`), "up -d"].join(" ");
}

function ProjectStatus({ project }: { project: ComposeProject }) {
  if (project.configuration === "unresolved") return <Badge tone="warning">Configuration unresolved</Badge>;
  const labels = { running: "Running", partial: "Partially running", stopped: "Stopped", "not-created": "No containers found", unknown: "Runtime unknown" };
  return <Badge tone={project.status === "running" ? "success" : project.status === "partial" ? "warning" : "neutral"}>{labels[project.status]}</Badge>;
}

const columns: Column<ComposeService>[] = [
  { key: "name", header: "Service", minWidth: 140, render: (s) => <span className="font-medium text-ink">{s.name}</span> },
  { key: "image", header: "Image / build", minWidth: 200, render: (s) => <div className="font-mono text-12">{s.image ?? (s.build ? "Local build" : "Not specified")}{s.image && s.build && <p className="mt-1 font-sans text-muted">Local build available</p>}</div> },
  { key: "ports", header: "Published ports", minWidth: 170, render: (s) => <div className="font-mono text-12">{s.ports.length ? s.ports.map((p) => <p key={p}>{p}</p>) : <span className="font-sans text-muted">None</span>}</div> },
  { key: "profiles", header: "Profiles", minWidth: 120, render: (s) => <span className="text-12 text-grey">{s.profiles.join(", ") || "Always enabled"}</span> },
];

function ProjectPreview({ initial, onClose }: { initial: ComposeProject; onClose: () => void }) {
  const [base, setBase] = useState(initial.selectedFiles[0]);
  const [override, setOverride] = useState(initial.selectedFiles[1] ?? "");
  const [project, setProject] = useState<ComposeProject | undefined>(initial);
  const [error, setError] = useState<Error>();
  const [profiles, setProfiles] = useState<string[]>([]);
  const toast = useToast();
  useEffect(() => {
    let current = true;
    setProfiles([]);
    setError(undefined);
    // Re-resolve when opened as well, so files edited since discovery are picked up.
    setProject(undefined);
    const file = initial.directory === "." ? base : `${initial.directory}/${base}`;
    void api.composePreview(file, override).then(
      (next) => { if (current) setProject(next); },
      (err: Error) => { if (current) setError(err); },
    );
    return () => { current = false; };
  }, [base, override, initial.directory]);
  const command = project && composeCommand(project, profiles);
  const enabled = project?.services.filter((s) => !s.profiles.length || s.profiles.some((p) => profiles.includes(p))).length ?? 0;
  return (
    <Modal title="Compose project" subtitle={initial.directory === "." ? "Workspace root" : initial.directory} width={980} onClose={onClose}>
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <label><span className="label">Base file</span>
          <select className="input" value={base} onChange={(e) => { setBase(e.target.value); if (e.target.value === override) setOverride(""); }}>
            {initial.files.map((file) => <option key={file} value={file}>{file}</option>)}
          </select>
        </label>
        <label><span className="label">Override file</span>
          <select className="input" value={override} onChange={(e) => setOverride(e.target.value)}>
            <option value="">No override</option>
            {initial.files.filter((file) => file !== base).map((file) => <option key={file} value={file}>{file}</option>)}
          </select>
        </label>
      </div>
      <ErrorBanner error={error} />
      {!project && !error && <p role="status" className="py-8 text-center text-muted">Resolving configuration…</p>}
      {project && <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-medium text-ink">{project.name}</h3>
          <ProjectStatus project={project} />
        </div>
        {project.issues.map((issue) => <p key={issue} className="mb-3 rounded-md bg-warning-soft p-3 text-13 text-warning">{issue}</p>)}
        {project.services.length > 0 && <DataTable rows={project.services} rowKey={(s) => s.name} columns={columns} empty={<NoItemFound message="No services defined." />} />}
        <p className="mt-3 text-12 text-muted">Preview uses the project’s .env file, not your host shell variables. Environment values and secrets are omitted.</p>
        {project.profiles.length > 0 && <fieldset className="mt-5">
          <legend className="mb-2 font-medium text-ink">Optional profiles</legend>
          <div className="flex flex-wrap gap-4">{project.profiles.map((profile) => <Toggle key={profile} label={profile} checked={profiles.includes(profile)}
            onChange={(checked) => setProfiles((old) => checked ? [...old, profile] : old.filter((p) => p !== profile))} />)}</div>
          <p className="mt-2 text-12 text-muted">{enabled} of {project.services.length} services enabled by these profiles.</p>
        </fieldset>}
        <section className="mt-5">
          <h3 className="mb-2 font-medium text-ink">Matching containers</h3>
          {project.containers.length === 0 ? <p className="text-13 text-muted">{project.status === "unknown" ? "Runtime matching is unavailable." : "No containers match these configuration files. Projects started with other files may appear under Stacks."}</p> :
            <div className="divide-y divide-line-soft rounded-md border border-line px-3">{project.containers.map((c) => <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Link to={`/containers/${c.id}`} onClick={onClose} className="text-accent hover:underline">{c.name}</Link>
              <span className="text-12 text-muted">Stack: {c.project}</span>
              <ContainerStatus state={c.state} status={c.status} />
            </div>)}</div>}
        </section>
        <section className="mt-5 rounded-lg border border-line bg-canvas p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="font-medium text-ink">Run on your host</h3>
            <Button variant="cancel" size="sm" icon={Copy} onClick={async () => {
              try { await navigator.clipboard.writeText(command!); toast.success("Compose command copied"); }
              catch { toast.error("Could not copy", "Select the command below and copy it manually."); }
            }}>Copy command</Button>
          </div>
          <p className="mb-3 text-12 text-muted">Run from {project.hostDirectory ? <code className="break-all">{project.hostDirectory}</code> :
            <>{project.directory === "." ? "the workspace root" : <code>{project.directory}</code>} in your host checkout</>}. Dockyard does not execute this command.</p>
          <pre className="overflow-x-auto text-12 text-body"><code>{command}</code></pre>
          {project.configuration === "unresolved" && <p className="mt-3 text-12 text-warning">Resolve the configuration issues before running this command.</p>}
        </section>
      </>}
    </Modal>
  );
}

export function ComposePage() {
  const manifest = usePolling(api.compose, 30_000);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ComposeProject>();
  const [rescanning, setRescanning] = useState(false);
  const toast = useToast();
  const projects = useMemo(() => (manifest.data?.projects ?? []).filter((project) =>
    [project.directory, project.name, ...project.files, ...project.services.map((s) => s.name)].join(" ").toLowerCase().includes(query.trim().toLowerCase())), [manifest.data, query]);
  return (
    <>
      <PageHeader title="Compose" subtitle="Discover applications defined in your workspace, even before their containers exist."
        actions={<Button variant="cancel" icon={RefreshCw} disabled={manifest.loading || rescanning} onClick={async () => {
          setRescanning(true);
          try { await api.rescanCompose(); await manifest.refresh(); }
          catch { toast.error("Could not rescan workspace", "Try again shortly."); }
          finally { setRescanning(false); }
        }}>{rescanning ? "Scanning…" : "Rescan"}</Button>} />
      <ErrorBanner error={manifest.error} />
      {manifest.data?.warnings.map((warning) => <p key={warning} className="mb-4 rounded-lg bg-warning-soft px-4 py-3 text-13 text-warning">{warning}</p>)}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4">
        <div className="min-w-0"><p className="text-12 text-muted">Mounted workspace</p><p className="mt-1 font-mono text-12 break-all text-ink">{manifest.data?.root ?? "Scanning…"}</p></div>
        <span className="text-13 text-grey">{manifest.data ? `${manifest.data.projects.length} ${manifest.data.projects.length === 1 ? "project" : "projects"}` : "Discovering projects"}</span>
      </div>
      <div className="mb-5"><SearchBar value={query} onChange={setQuery} placeholder="Search Compose projects" /></div>
      {manifest.loading && !manifest.data && <p role="status" className="py-10 text-center text-13 text-muted">Scanning workspace and resolving Compose files…</p>}
      {manifest.data && projects.length === 0 && <Card><NoItemFound message={query ? "No matching Compose projects." : "No Compose files found."}
        hint={query ? "Try a project, service, or file name." : <>Mount a repository at <code>/workspace</code>. Dockyard looks for compose.yaml, compose.yml, docker-compose files, and named variants in nested directories.</>} /></Card>}
      <div className="grid gap-4 xl:grid-cols-2">
        {projects.map((project) => <Card key={project.directory}>
          <div className="flex items-start gap-3">
            <span className="rounded-lg bg-primary-soft p-2 text-accent"><Files size={20} aria-hidden /></span>
            <div className="min-w-0 flex-1"><h2 className="font-medium break-words text-ink">{project.name}</h2><p className="mt-1 font-mono text-12 break-all text-muted">{project.directory === "." ? "Workspace root" : project.directory}</p></div>
          </div>
          <div className="mt-4"><ProjectStatus project={project} /></div>
          <p className="mt-3 font-mono text-12 break-all text-grey">{project.selectedFiles.join(" + ")}</p>
          {project.services.length > 0 && <p className="mt-2 text-13 text-grey">{project.services.length} {project.services.length === 1 ? "service" : "services"}: {project.services.map((s) => s.name).join(", ")}</p>}
          {project.profiles.length > 0 && <p className="mt-2 text-12 text-muted">Profiles: {project.profiles.join(", ")}</p>}
          {project.issues[0] && <p className="mt-3 text-12 text-warning">{project.issues[0]}</p>}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-12 text-muted">{project.files.length} configuration {project.files.length === 1 ? "file" : "files"}</span>
            <Button variant="cancel" size="sm" onClick={() => setSelected(project)} aria-label={`View project ${project.directory}`}>View project</Button>
          </div>
        </Card>)}
      </div>
      {selected && <ProjectPreview initial={selected} onClose={() => setSelected(undefined)} />}
    </>
  );
}
