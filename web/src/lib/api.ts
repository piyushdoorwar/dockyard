import {
  type BulkResult,
  type AgentsManifest,
  type ComposeManifest,
  type ComposeProject,
  type ContainerSummary,
  CSRF_HEADER,
  type DiskUsage,
  type ImageSummary,
  type NetworkingSnapshot,
  type PruneResult,
  type StackStatus,
  type StackSummary,
  type SystemInfo,
  type VolumeSummary,
} from "../../../shared/types";

export type { StackStatus };

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  // The server refuses state changes without this header (CSRF guard).
  if (method !== "GET") headers[CSRF_HEADER] = "1";
  if (body !== undefined) headers["content-type"] = "application/json";

  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

const enc = encodeURIComponent;

export type ContainerAction = "start" | "stop" | "restart";

export const api = {
  networking: () => request<NetworkingSnapshot>("GET", "/api/networking"),
  compose: () => request<ComposeManifest>("GET", "/api/compose"),
  rescanCompose: () => request<ComposeManifest>("GET", "/api/compose?refresh=1"),
  composePreview: (file: string, override = "") => request<ComposeProject>("GET", `/api/compose/preview?${new URLSearchParams({ file, override })}`),
  agents: () => request<AgentsManifest>("GET", "/api/agents"),
  system: () => request<SystemInfo>("GET", "/api/system"),
  diskUsage: () => request<DiskUsage>("GET", "/api/system/df"),
  cleanUp: () => request<PruneResult>("POST", "/api/system/prune"),

  containers: () => request<ContainerSummary[]>("GET", "/api/containers"),
  inspectContainer: (id: string) => request<ContainerInspect>("GET", `/api/containers/${enc(id)}`),
  containerAction: (id: string, action: ContainerAction) =>
    request<{ ok: true }>("POST", `/api/containers/${enc(id)}/${action}`),
  removeContainer: (id: string) => request<{ ok: true }>("DELETE", `/api/containers/${enc(id)}?force=true`),

  stacks: () => request<StackSummary[]>("GET", "/api/stacks"),
  stackAction: (name: string, action: ContainerAction) =>
    request<BulkResult>("POST", `/api/stacks/${enc(name)}/${action}`),
  removeStack: (name: string) => request<BulkResult>("DELETE", `/api/stacks/${enc(name)}`),

  images: () => request<ImageSummary[]>("GET", "/api/images"),
  pullImage: (image: string) => request<{ ok: true; image: string }>("POST", "/api/images/pull", { image }),
  removeImage: (id: string) => request<{ ok: true }>("DELETE", `/api/images/${enc(id)}`),
  pruneImages: (all: boolean) => request<PruneResult>("POST", "/api/images/prune", { all }),

  volumes: () => request<VolumeSummary[]>("GET", "/api/volumes"),
  removeVolume: (name: string) => request<{ ok: true }>("DELETE", `/api/volumes/${enc(name)}`),
  pruneVolumes: () => request<PruneResult>("POST", "/api/volumes/prune"),
};

/** The parts of `docker inspect` the detail page reads. */
export interface ContainerInspect {
  Id: string;
  Name: string;
  Created: string;
  State: { Status: string; Running: boolean; StartedAt?: string; ExitCode?: number; Health?: { Status: string } };
  Config: { Image: string; Env?: string[] | null; Labels?: Record<string, string> | null; Tty?: boolean };
  Mounts?: { Type: string; Source: string; Destination: string; Name?: string; RW: boolean }[];
  NetworkSettings?: { Ports?: Record<string, { HostIp: string; HostPort: string }[] | null> };
  [key: string]: unknown;
}

/** Same-origin WebSocket URL for an /api path. */
export function wsUrl(path: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}`;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
