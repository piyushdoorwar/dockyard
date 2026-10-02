import type Docker from "dockerode";
import type {
  ContainerSummary,
  ImageSummary,
  PortMapping,
  StackSummary,
  VolumeSummary,
} from "../../shared/types.js";

/** Baked into the image (see Dockerfile) so the app can recognise its own container. */
export const SELF_LABEL = "com.dockyard.runtime";
export const PROJECT_LABEL = "com.docker.compose.project";
const PROJECT_DIR_LABEL = "com.docker.compose.project.working_dir";
const SERVICE_LABEL = "com.docker.compose.service";

export function isSelf(labels: Record<string, string> | null | undefined): boolean {
  return labels?.[SELF_LABEL] === "true";
}

export function shortId(id: string): string {
  return id.replace(/^sha256:/, "").slice(0, 12);
}

/**
 * Docker lists a published port once per address family (0.0.0.0 and ::), so
 * collapse duplicates and sort for a stable display.
 */
export function dedupePorts(ports: Docker.Port[]): PortMapping[] {
  const seen = new Map<string, PortMapping>();
  for (const p of ports) {
    const key = `${p.PrivatePort}/${p.Type}/${p.PublicPort ?? ""}`;
    const existing = seen.get(key);
    if (!existing || (p.IP && p.IP.includes(".") && !existing.ip?.includes("."))) {
      seen.set(key, { privatePort: p.PrivatePort, publicPort: p.PublicPort, type: p.Type, ip: p.IP });
    }
  }
  return [...seen.values()].sort(
    (a, b) => a.privatePort - b.privatePort || (a.publicPort ?? 0) - (b.publicPort ?? 0),
  );
}

export function toContainerSummary(c: Docker.ContainerInfo): ContainerSummary {
  const labels = c.Labels ?? {};
  return {
    id: c.Id,
    shortId: shortId(c.Id),
    name: (c.Names?.[0] ?? c.Id).replace(/^\//, ""),
    image: c.Image,
    imageId: c.ImageID,
    state: c.State,
    status: c.Status,
    created: c.Created,
    ports: dedupePorts(c.Ports ?? []),
    project: labels[PROJECT_LABEL] ?? null,
    projectDir: labels[PROJECT_DIR_LABEL] ?? null,
    service: labels[SERVICE_LABEL] ?? null,
    isSelf: isSelf(labels),
  };
}

/** Compose projects, the way Docker Desktop groups them. Containers outside compose are left out. */
export function groupStacks(containers: ContainerSummary[]): StackSummary[] {
  const byProject = new Map<string, ContainerSummary[]>();
  for (const c of containers) {
    if (!c.project) continue;
    const list = byProject.get(c.project) ?? [];
    list.push(c);
    byProject.set(c.project, list);
  }
  return [...byProject.entries()]
    .map(([name, list]) => {
      const running = list.filter((c) => c.state === "running").length;
      return {
        name,
        workingDir: list.find((c) => c.projectDir)?.projectDir ?? null,
        status: running === 0 ? "stopped" : running === list.length ? "running" : "partial",
        running,
        total: list.length,
        containers: [...list].sort((a, b) => (a.service ?? a.name).localeCompare(b.service ?? b.name)),
      } satisfies StackSummary;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** "registry:5000/team/app:1.2" → ["registry:5000/team/app", "1.2"]; a port is not a tag. */
export function splitRepoTag(ref: string): [string, string] {
  const at = ref.indexOf("@");
  if (at !== -1) return [ref.slice(0, at), "<none>"];
  const colon = ref.lastIndexOf(":");
  if (colon > ref.lastIndexOf("/")) return [ref.slice(0, colon), ref.slice(colon + 1)];
  return [ref, "latest"];
}

export function toImageSummary(img: Docker.ImageInfo, usage: Map<string, number>): ImageSummary {
  const repoTags = (img.RepoTags ?? []).filter((t) => t !== "<none>:<none>");
  const digestRepo = (img.RepoDigests ?? []).find((d) => d !== "<none>@<none>");
  const [repository, tag] = repoTags[0]
    ? splitRepoTag(repoTags[0])
    : [digestRepo ? splitRepoTag(digestRepo)[0] : "<none>", "<none>"];
  return {
    id: img.Id,
    shortId: shortId(img.Id),
    repository,
    tag,
    repoTags,
    size: img.Size,
    created: img.Created,
    containers: usage.get(img.Id) ?? 0,
    dangling: repoTags.length === 0,
  };
}

interface VolumeUsage {
  Name: string;
  UsageData?: { Size?: number; RefCount?: number } | null;
}

export function toVolumeSummary(v: Docker.VolumeInspectInfo, usage: Map<string, VolumeUsage>): VolumeSummary {
  const u = usage.get(v.Name)?.UsageData;
  const created = (v as { CreatedAt?: string }).CreatedAt ?? null;
  return {
    name: v.Name,
    driver: v.Driver,
    mountpoint: v.Mountpoint,
    created,
    // Docker reports -1 when it hasn't computed usage.
    size: u && typeof u.Size === "number" && u.Size >= 0 ? u.Size : null,
    refCount: u && typeof u.RefCount === "number" && u.RefCount >= 0 ? u.RefCount : null,
    project: v.Labels?.[PROJECT_LABEL] ?? null,
  };
}
