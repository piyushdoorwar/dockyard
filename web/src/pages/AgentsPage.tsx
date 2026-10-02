import { useMemo, useState } from "react";
import type { AgentFile } from "../../../shared/types";
import { Button } from "../components/Button";
import { Card, ErrorBanner, PageHeader } from "../components/Page";
import { api } from "../lib/api";
import { usePolling } from "../lib/usePolling";

function AgentDocument({ file }: { file: AgentFile }) {
  return (
    <article className="agent-document">
      <div className="agent-file-heading">
        <span className="agent-file-icon"><i className="pi pi-file-edit" aria-hidden /></span>
        <div className="min-w-0">
          <h2>{file.relativePath}</h2>
          <p>{file.sections.length} instruction {file.sections.length === 1 ? "section" : "sections"}</p>
        </div>
      </div>
      <div className="agent-sections">
        {file.sections.length === 0 ? (
          <p className="agent-empty">This file is empty.</p>
        ) : (
          file.sections.map((section, index) => (
            <section className="agent-section" key={`${section.title}-${index}`} style={{ "--depth": Math.max(0, section.level - 1) } as React.CSSProperties}>
              <div className="agent-section-marker" aria-hidden />
              <div>
                <span className="agent-level">{section.level ? `H${section.level}` : "TXT"}</span>
                <h3>{section.title}</h3>
                {section.body && <pre>{section.body}</pre>}
              </div>
            </section>
          ))
        )}
      </div>
    </article>
  );
}

export function AgentsPage() {
  const manifest = usePolling(api.agents, 15_000);
  const [query, setQuery] = useState("");
  const files = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return manifest.data?.files ?? [];
    return (manifest.data?.files ?? []).filter((file) =>
      `${file.relativePath}\n${file.content}`.toLowerCase().includes(needle),
    );
  }, [manifest.data, query]);

  const sections = manifest.data?.files.reduce((count, file) => count + file.sections.length, 0) ?? 0;
  return (
    <>
      <PageHeader
        title="Agent instructions"
        subtitle="One combined view of every AGENTS.md in the mounted workspace."
        actions={<Button icon="pi-refresh" variant="cancel" onClick={() => void manifest.refresh()}>Rescan</Button>}
      />
      <ErrorBanner error={manifest.error} />
      <div className="agent-summary-grid">
        <Card><span className="agent-summary-label">Workspace</span><strong className="agent-summary-path">{manifest.data?.root ?? "Scanning…"}</strong></Card>
        <Card><span className="agent-summary-label">Files discovered</span><strong>{manifest.data?.files.length ?? "—"}</strong></Card>
        <Card><span className="agent-summary-label">Combined sections</span><strong>{manifest.data ? sections : "—"}</strong></Card>
      </div>
      <div className="agent-toolbar">
        <label className="agent-search">
          <i className="pi pi-search" aria-hidden />
          <span className="sr-only">Filter instructions</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter files or instructions…" />
        </label>
        <span>{files.length} of {manifest.data?.files.length ?? 0} files</span>
      </div>
      <div className="agent-map">
        <div className="agent-trunk" aria-hidden />
        {files.map((file) => <AgentDocument file={file} key={file.path} />)}
        {manifest.data && files.length === 0 && (
          <div className="agent-no-results">
            <i className="pi pi-sitemap" aria-hidden />
            <h2>{query ? "No matching instructions" : "No AGENTS.md files found"}</h2>
            <p>{query ? "Try a broader filter." : "Mount a repository and set DOCKYARD_WORKSPACE to its path."}</p>
          </div>
        )}
      </div>
    </>
  );
}
