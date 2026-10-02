import type Docker from "dockerode";
import type { FastifyInstance } from "fastify";
import type { DiskUsage, PruneResult, SystemInfo, UsageBucket } from "../../../shared/types.js";

interface DfResponse {
  LayersSize?: number;
  Images?: { Size?: number; SharedSize?: number; Containers?: number }[];
  Containers?: { SizeRw?: number; State?: string }[];
  Volumes?: { UsageData?: { Size?: number; RefCount?: number } }[];
  BuildCache?: { Size?: number; InUse?: boolean; Shared?: boolean }[];
}

const bucket = (count: number, size: number, reclaimable: number): UsageBucket => ({ count, size, reclaimable });
const positive = (n: number | undefined) => (typeof n === "number" && n > 0 ? n : 0);

/** Totals like `docker system df`. */
export function summariseDiskUsage(df: DfResponse): DiskUsage {
  const images = df.Images ?? [];
  const containers = df.Containers ?? [];
  const volumes = df.Volumes ?? [];
  const cache = df.BuildCache ?? [];

  const imagesSize = positive(df.LayersSize) || images.reduce((s, i) => s + positive(i.Size), 0);
  const unusedImages = images
    .filter((i) => !i.Containers)
    .reduce((s, i) => s + Math.max(0, positive(i.Size) - positive(i.SharedSize)), 0);
  const containersSize = containers.reduce((s, c) => s + positive(c.SizeRw), 0);
  const stoppedSize = containers.filter((c) => c.State !== "running").reduce((s, c) => s + positive(c.SizeRw), 0);
  const volumesSize = volumes.reduce((s, v) => s + positive(v.UsageData?.Size), 0);
  const unusedVolumes = volumes.filter((v) => v.UsageData?.RefCount === 0).reduce((s, v) => s + positive(v.UsageData?.Size), 0);
  const cacheSize = cache.filter((c) => !c.Shared).reduce((s, c) => s + positive(c.Size), 0);
  const cacheFree = cache.filter((c) => !c.Shared && !c.InUse).reduce((s, c) => s + positive(c.Size), 0);

  return {
    images: bucket(images.length, imagesSize, unusedImages),
    containers: bucket(containers.length, containersSize, stoppedSize),
    volumes: bucket(volumes.length, volumesSize, unusedVolumes),
    buildCache: bucket(cache.length, cacheSize, cacheFree),
    total: imagesSize + containersSize + volumesSize + cacheSize,
  };
}

export function systemRoutes(app: FastifyInstance, docker: Docker, appVersion: string): void {
  app.get("/api/health", async () => ({ ok: true, version: appVersion }));

  app.get("/api/system", async (): Promise<SystemInfo> => {
    const info = await docker.info();
    return {
      name: info.Name,
      serverVersion: info.ServerVersion,
      os: info.OperatingSystem,
      kernelVersion: info.KernelVersion,
      architecture: info.Architecture,
      cpus: info.NCPU,
      memTotal: info.MemTotal,
      containers: {
        total: info.Containers,
        running: info.ContainersRunning,
        paused: info.ContainersPaused,
        stopped: info.ContainersStopped,
      },
      images: info.Images,
      appVersion,
    };
  });

  app.get("/api/system/df", async () => summariseDiskUsage((await docker.df()) as DfResponse));

  // "Clean up": stopped containers, dangling images, unused networks, unused
  // build cache. Volumes are deliberately left alone — they hold databases.
  app.post("/api/system/prune", async (): Promise<PruneResult> => {
    const containers = await docker.pruneContainers();
    const images = await docker.pruneImages({ filters: { dangling: { true: true } } });
    const networks = await docker.pruneNetworks();
    const cache = (await docker.pruneBuilder()) as { SpaceReclaimed?: number; CachesDeleted?: string[] | null };
    return {
      reclaimed: (containers.SpaceReclaimed ?? 0) + (images.SpaceReclaimed ?? 0) + (cache.SpaceReclaimed ?? 0),
      deleted:
        (containers.ContainersDeleted?.length ?? 0) +
        (images.ImagesDeleted?.length ?? 0) +
        (networks.NetworksDeleted?.length ?? 0) +
        (cache.CachesDeleted?.length ?? 0),
    };
  });
}
