import type Docker from "dockerode";
import type { FastifyInstance } from "fastify";
import type { PruneResult } from "../../../shared/types.js";
import { toVolumeSummary } from "../mappers.js";
import { NAME_OR_ID } from "./schemas.js";

export function volumeRoutes(app: FastifyInstance, docker: Docker): void {
  app.get("/api/volumes", async () => {
    // listVolumes has no sizes; the disk-usage endpoint does.
    const [list, df] = await Promise.all([docker.listVolumes(), docker.df()]);
    const usage = new Map<string, { Name: string; UsageData?: { Size?: number; RefCount?: number } }>();
    for (const v of (df.Volumes ?? []) as { Name: string; UsageData?: { Size?: number; RefCount?: number } }[]) {
      usage.set(v.Name, v);
    }
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
