import type Docker from "dockerode";
import type { FastifyInstance } from "fastify";
import type { PruneResult } from "../../../shared/types.js";
import { toVolumeSummary } from "../mappers.js";
import { NAME_OR_ID } from "./schemas.js";

interface VolumeUsage {
  Name: string;
  UsageData?: { Size?: number; RefCount?: number } | null;
}

/**
 * Disk usage for volumes only. `type=volume` (Engine API 1.42+) skips sizing
 * every image layer and container filesystem, which is most of the cost of a
 * full `docker system df`; older engines ignore it and answer in full.
 * dockerode's df() doesn't forward query options, hence the raw dial.
 */
export function volumeUsage(docker: Docker): Promise<VolumeUsage[]> {
  return new Promise((resolve, reject) => {
    docker.modem.dial(
      {
        path: "/system/df?",
        method: "GET",
        options: { type: ["volume"] },
        statusCodes: { 200: true, 500: "server error" },
      },
      (err, data) => (err ? reject(err) : resolve(((data as { Volumes?: VolumeUsage[] | null })?.Volumes ?? []))),
    );
  });
}

export function volumeRoutes(app: FastifyInstance, docker: Docker): void {
  app.get("/api/volumes", async () => {
    // listVolumes has no sizes; the disk-usage endpoint does.
    const [list, sizes] = await Promise.all([docker.listVolumes(), volumeUsage(docker)]);
    const usage = new Map<string, VolumeUsage>();
    for (const v of sizes) usage.set(v.Name, v);
    return (list.Volumes ?? []).map((v) => toVolumeSummary(v, usage)).sort((a, b) => a.name.localeCompare(b.name));
  });

  app.delete<{ Params: { name: string } }>(
    "/api/volumes/:name",
    {
      schema: { params: { type: "object", required: ["name"], properties: { name: { type: "string", pattern: NAME_OR_ID } } } },
    },
    async (req) => {
      await docker.getVolume(req.params.name).remove();
      return { ok: true };
    },
  );

  app.post("/api/volumes/prune", async (): Promise<PruneResult> => {
    // all=true: include named volumes, not just anonymous ones (Engine 23+ default).
    const res = await docker.pruneVolumes({ filters: { all: ["true"] } });
    return { reclaimed: res.SpaceReclaimed ?? 0, deleted: res.VolumesDeleted?.length ?? 0 };
  });
}
