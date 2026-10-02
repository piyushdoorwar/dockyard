import type { StatsSample } from "../../shared/types.js";

// Subset of the Engine API /containers/{id}/stats payload that we read.
export interface RawStats {
  read?: string;
  pids_stats?: { current?: number };
  cpu_stats?: CpuStats;
  precpu_stats?: CpuStats;
  memory_stats?: { usage?: number; limit?: number; stats?: Record<string, number> };
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
  // The first sample of a stream has no previous reading (system usage 0), so no delta yet.
  const hasPrevious = (pre.system_cpu_usage ?? 0) > 0;
  const cpuPercent =
    hasPrevious && cpuDelta > 0 && systemDelta > 0 ? (cpuDelta / systemDelta) * onlineCpus * 100 : 0;

  // cgroup v2 reports inactive_file, v1 reports cache — both are reclaimable page cache.
  const mem = raw.memory_stats ?? {};
  const cache = mem.stats?.inactive_file ?? mem.stats?.total_inactive_file ?? mem.stats?.cache ?? 0;
  const memUsage = Math.max(0, (mem.usage ?? 0) - cache);
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
