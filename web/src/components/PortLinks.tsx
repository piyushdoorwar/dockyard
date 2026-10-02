import { ExternalLink } from "lucide-react";
import type { PortMapping } from "../../../shared/types";

/** Published ports as clickable localhost links. */
export function PortLinks({ ports }: { ports: PortMapping[] }) {
  // Docker lists one binding per host address (0.0.0.0 and ::), so collapse those.
  const seen = new Set<string>();
  const published = ports.filter((p) => {
    const key = `${p.publicPort}-${p.privatePort}-${p.type}`;
    if (!p.publicPort || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (published.length === 0) return <span className="text-muted">—</span>;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {published.map((p) => (
        <a
          key={`${p.publicPort}-${p.privatePort}-${p.type}`}
          href={`http://localhost:${p.publicPort}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-mono text-12 whitespace-nowrap text-primary hover:underline"
          title={`Host ${p.publicPort} to container ${p.privatePort}/${p.type}`}
        >
          {p.publicPort}:{p.privatePort}
          <ExternalLink size={11} aria-hidden />
        </a>
      ))}
    </div>
  );
}
