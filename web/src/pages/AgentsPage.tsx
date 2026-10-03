import { ChevronDown, FileText, Network, RefreshCw } from "lucide-react";
import { type CSSProperties, useId, useMemo, useState } from "react";
import type { AgentFile } from "../../../shared/types";
import { Button } from "../components/Button";
import { ErrorBanner, PageHeader } from "../components/Page";
import { SearchBar } from "../components/SearchBar";
import { api } from "../lib/api";
import { usePolling } from "../lib/usePolling";

function AgentDocument({ file }: { file: AgentFile }) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  return (
    <article className="agent-document">
      <h2>
        <button type="button" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-3 rounded-lg px-4 py-3.5 text-left hover:bg-primary-tint focus-visible:outline-2 focus-visible:outline-accent sm:px-5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-accent">
            <FileText size={16} aria-hidden />
          </span>
          <span className="min-w-0 flex-1 break-words font-mono text-13 font-medium text-ink">{file.relativePath}</span>
          <ChevronDown size={17} aria-hidden className={`shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
        </button>
      </h2>
      <div id={contentId} hidden={!expanded}>
        {expanded && (
          <>
            <p className="border-t border-line-soft px-4 pt-3 text-11 text-muted sm:px-5">
              {file.sections.length} instruction {file.sections.length === 1 ? "section" : "sections"}
              {file.truncated && <span className="text-warning"> · too large, showing the first 512 KB</span>}
            </p>
            <div className="grid px-4 pt-1 pb-4 sm:px-5">
              {file.sections.length === 0 ? (
                <p className="pt-3 text-13 text-muted">This file is empty.</p>
              ) : (
                file.sections.map((section, index) => (
                  <section className="agent-section" key={`${section.title}-${index}`} style={{ "--depth": Math.max(0, section.level - 1) } as CSSProperties}>
                    <div className="agent-section-marker" aria-hidden />
                    <div className="min-w-0">
                      <span className="float-left mt-px mr-2 rounded bg-primary-tint px-1.5 py-0.5 font-mono text-[9px] font-semibold text-grey">
                        {section.level ? `H${section.level}` : "TXT"}
                      </span>
                      <h3 className="text-13 font-medium text-ink">{section.title}</h3>
                      {section.body && (
                        <pre className="mt-2 max-h-44 overflow-auto rounded-md border border-line-soft bg-line-soft px-3 py-2.5 text-[11.5px] leading-relaxed whitespace-pre-wrap text-body">
                          {section.body}
                        </pre>
                      )}
                    </div>
                  </section>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </article>
  );
}

function Summary({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface p-5">
      <p className="text-12 text-muted">{label}</p>
      <p className={mono ? "mt-2 truncate font-mono text-12 font-medium text-ink" : "mt-2 text-[22px] leading-none font-medium text-ink"}>{children}</p>
    </div>
  );
}

export function AgentsPage() {
  const manifest = usePolling(api.agents, 15_000);
  const [query, setQuery] = useState("");
  const all = manifest.data?.files;
  const files = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return all ?? [];
    return (all ?? []).filter((file) => `${file.relativePath}\n${file.content}`.toLowerCase().includes(needle));
  }, [all, query]);

  const sections = all?.reduce((count, file) => count + file.sections.length, 0) ?? 0;
  return (
    <>
      <PageHeader
        title="Agent instructions"
        subtitle="One combined view of every AGENTS.md in the mounted workspace."
        actions={
          <Button icon={RefreshCw} variant="cancel" onClick={() => void manifest.refresh()}>
            Rescan
          </Button>
        }
      />
      <ErrorBanner error={manifest.error} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Summary label="Workspace" mono>
          <span title={manifest.data?.root}>{manifest.data?.root ?? "Scanning…"}</span>
        </Summary>
        <Summary label="Files discovered">{all?.length ?? "—"}</Summary>
        <Summary label="Combined sections">{manifest.data ? sections : "—"}</Summary>
      </div>
      <div className="my-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchBar value={query} onChange={setQuery} placeholder="Filter instructions" />
        <span className="text-12 text-muted">
          {files.length} of {all?.length ?? 0} files
        </span>
      </div>
      {manifest.data && files.length === 0 ? (
        <div className="grid justify-items-center gap-2 rounded-lg border border-dashed border-line bg-surface p-12 text-center">
          <Network size={24} className="text-muted" aria-hidden />
          <h2 className="text-sm font-medium text-ink">{query ? "No matching instructions" : "No AGENTS.md files found"}</h2>
          <p className="text-13 text-muted">
            {query ? "Try a broader filter." : (
              <>
                Mount a repository at <code>/workspace</code>, or set <code>DOCKYARD_WORKSPACE</code> to its path.
              </>
            )}
          </p>
        </div>
      ) : (
        <div className="agent-map">
          <div className="agent-trunk" aria-hidden />
          {files.map((file) => (
            <AgentDocument file={file} key={file.path} />
          ))}
        </div>
      )}
    </>
  );
}
