import type { PortMapping } from "../../../shared/types";

/** Published ports as clickable localhost links (Docker Desktop's "Port(s)" column). */
export function PortLinks({ ports }: { ports: PortMapping[] }) {
  const published = ports.filter((p) => p.publicPort);
  if (published.length === 0) return <span className="text-muted">—</span>;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {published.map((p) => (
        <a
          key={`${p.publicPort}-${p.privatePort}-${p.type}`}
          href={`http://localhost:${p.publicPort}`}
          target="_blank"
          rel="noreferrer"
          className="text-13 text-primary hover:underline whitespace-nowrap"
          title={`Host ${p.publicPort} → container ${p.privatePort}/${p.type}`}
        >
          {p.publicPort}:{p.privatePort}
          <i className="pi pi-external-link ml-1" style={{ fontSize: 10 }} aria-hidden />
        </a>
      ))}
    </div>
  );
}
