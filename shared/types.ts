// Shapes shared by the API server and the web UI. The server maps raw Docker
// Engine API objects into these so the UI never depends on Docker's own JSON.

export interface PortMapping {
  privatePort: number;
  publicPort?: number;
  type: string;
  ip?: string;
}

export interface ContainerSummary {
  id: string;
  shortId: string;
  name: string;
  image: string;
  imageId: string;
  /** Docker's machine state: running, exited, paused, restarting, created, dead, removing. */
  state: string;
  /** Docker's human status, e.g. "Up 3 hours (healthy)". */
  status: string;
  /** Unix seconds. */
  created: number;
  ports: PortMapping[];
  /** Compose project (the "stack") this container belongs to, if any. */
  project: string | null;
  projectDir: string | null;
  service: string | null;
  /** True for Dockyard's own container — it must not stop or delete itself. */
  isSelf: boolean;
}

export type StackStatus = "running" | "partial" | "stopped";

export interface StackSummary {
  name: string;
  workingDir: string | null;
  status: StackStatus;
  running: number;
  total: number;
  containers: ContainerSummary[];
}

export interface ImageSummary {
  id: string;
  shortId: string;
  repository: string;
  tag: string;
  repoTags: string[];
  size: number;
  /** Unix seconds. */
  created: number;
  /** Number of containers (any state) created from this image. */
  containers: number;
  dangling: boolean;
}

export interface VolumeSummary {
  name: string;
  driver: string;
  mountpoint: string;
  created: string | null;
  /** Bytes, or null when Docker didn't report usage. */
  size: number | null;
  /** Containers using the volume, or null when unknown. */
  refCount: number | null;
  project: string | null;
}

export interface SystemInfo {
  name: string;
  serverVersion: string;
  os: string;
  kernelVersion: string;
  architecture: string;
  cpus: number;
  memTotal: number;
  containers: { total: number; running: number; paused: number; stopped: number };
  images: number;
  appVersion: string;
}

export interface UsageBucket {
  count: number;
  size: number;
  reclaimable: number;
}

export interface DiskUsage {
  images: UsageBucket;
  containers: UsageBucket;
  volumes: UsageBucket;
  buildCache: UsageBucket;
  total: number;
}

export interface PruneResult {
  reclaimed: number;
  deleted: number;
}

export interface BulkResult {
  results: { id: string; name: string; ok: boolean; error?: string }[];
}

export interface StatsSample {
  cpuPercent: number;
  memUsage: number;
  memLimit: number;
  memPercent: number;
  netRx: number;
  netTx: number;
  blockRead: number;
  blockWrite: number;
  pids: number;
  timestamp: string;
}

export interface LogLine {
  stream: "stdout" | "stderr";
  ts: string | null;
  text: string;
}

/** Server → client messages on the logs and stats WebSockets. */
export type LiveMessage =
  | { type: "logs"; lines: LogLine[] }
  | { type: "stats"; sample: StatsSample }
  | { type: "error"; message: string }
  | { type: "end" };

/** Client → server messages on the exec (terminal) WebSocket. */
export type ExecClientMessage =
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number };

export interface AgentSection {
  level: number;
  title: string;
  body: string;
}

export interface AgentFile {
  path: string;
  relativePath: string;
  directory: string;
  content: string;
  sections: AgentSection[];
  /** Set when the file was too large and only its beginning is included. */
  truncated?: boolean;
}

export interface AgentsManifest {
  root: string;
  files: AgentFile[];
  scannedAt: string;
}

/** Header every state-changing request must carry (see server/src/security.ts). */
export const CSRF_HEADER = "x-dockyard";
