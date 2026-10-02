import type { StatsSample } from "../../shared/types.js";

// Subset of the Engine API /containers/{id}/stats payload that we read.
export interface RawStats {
  read?: string;
  /** Windows only: when the previous sample was taken. */
  preread?: string;
  /** Windows only: processors available to the container. */
  num_procs?: number;
  pids_stats?: { current?: number };
  cpu_stats?: CpuStats;
  precpu_stats?: CpuStats;
  memory_stats?: { usage?: number; limit?: number; stats?: Record<string, number>; privateworkingset?: number };
  networks?: Record<string, { rx_bytes?: number; tx_bytes?: number }>;
  blkio_stats?: { io_service_bytes_recursive?: { op: string; value: number }[] | null };
}

interface CpuStats {
  cpu_usage?: { total_usage?: number; percpu_usage?: number[] };
  system_cpu_usage?: number;
  online_cpus?: number;
}

/** Same arithmetic as `docker stats` (CPU % can exceed 100 on multi-core hosts). */
export function computeStats(raw: RawStats): StatsSample {
  const cpu = raw.cpu_stats ?? {};
  const pre = raw.precpu_stats ?? {};
  const cpuDelta = (cpu.cpu_usage?.total_usage ?? 0) - (pre.cpu_usage?.total_usage ?? 0);
  const systemDelta = (cpu.system_cpu_usage ?? 0) - (pre.system_cpu_usage ?? 0);
  const onlineCpus = cpu.online_cpus || cpu.cpu_usage?.percpu_usage?.length || 1;
  let cpuPercent = 0;
  if (raw.num_procs && cpu.system_cpu_usage === undefined) {
    // Windows has no system usage counter: CPU time is in 100ns ticks, measured
    // against the wall-clock time between samples on every processor.
    const intervalMs = Date.parse(raw.read ?? "") - Date.parse(raw.preread ?? "");
    const possible = intervalMs * 10_000 * raw.num_procs;
    if (possible > 0 && cpuDelta > 0) cpuPercent = (cpuDelta / possible) * 100;
  } else {
    // The first sample of a stream has no previous reading (system usage 0), so no delta yet.
    const hasPrevious = (pre.system_cpu_usage ?? 0) > 0;
    if (hasPrevious && cpuDelta > 0 && systemDelta > 0) cpuPercent = (cpuDelta / systemDelta) * onlineCpus * 100;
  }

  // Page cache is reclaimable, so `docker stats` leaves it out. cgroup v1 has
  // both total_inactive_file (whole hierarchy, what the CLI uses) and
  // inactive_file (this cgroup only); v2 only has inactive_file; very old
  // engines only report cache. Windows reports a private working set instead.
  const mem = raw.memory_stats ?? {};
  const cache = mem.stats?.total_inactive_file ?? mem.stats?.inactive_file ?? mem.stats?.cache ?? 0;
  const memUsage =
    mem.usage === undefined && typeof mem.privateworkingset === "number"
      ? mem.privateworkingset
      : Math.max(0, (mem.usage ?? 0) - cache);
  const memLimit = mem.limit ?? 0;

  let netRx = 0;
  let netTx = 0;
  for (const n of Object.values(raw.networks ?? {})) {
    netRx += n.rx_bytes ?? 0;
    netTx += n.tx_bytes ?? 0;
  }

  let blockRead = 0;
  let blockWrite = 0;
  for (const io of raw.blkio_stats?.io_service_bytes_recursive ?? []) {
    const op = io.op.toLowerCase();
    if (op === "read") blockRead += io.value;
    else if (op === "write") blockWrite += io.value;
  }

  return {
    cpuPercent: round2(cpuPercent),
    memUsage,
    memLimit,
    memPercent: memLimit > 0 ? round2((memUsage / memLimit) * 100) : 0,
    netRx,
    netTx,
    blockRead,
    blockWrite,
    pids: raw.pids_stats?.current ?? 0,
    timestamp: raw.read ?? new Date().toISOString(),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
