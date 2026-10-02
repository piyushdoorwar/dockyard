import type Docker from "dockerode";
import type { FastifyInstance } from "fastify";
import type { PruneResult } from "../../../shared/types.js";
import { toImageSummary } from "../mappers.js";
import { forceQuery, IMAGE_ID, IMAGE_REF } from "./schemas.js";

/** Pull everything up to the last layer, resolving when Docker reports completion. */
export function pullImage(docker: Docker, ref: string): Promise<void> {
  return new Promise((resolve, reject) => {
    docker.pull(ref, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (doneErr: Error | null, output: { error?: string }[]) => {
        if (doneErr) return reject(doneErr);
        const failed = output?.find((o) => o.error);
        if (failed) return reject(new Error(failed.error));
        resolve();
      });
    });
  });
}

/** `docker pull nginx` means nginx:latest; the Engine API wants that spelled out. */
export function withDefaultTag(ref: string): string {
  if (ref.includes("@")) return ref;
  return ref.lastIndexOf(":") > ref.lastIndexOf("/") ? ref : `${ref}:latest`;
}

export function imageRoutes(app: FastifyInstance, docker: Docker): void {
  app.get("/api/images", async () => {
    const [images, containers] = await Promise.all([
      docker.listImages({ all: false }),
      docker.listContainers({ all: true }),
    ]);
    const usage = new Map<string, number>();
    for (const c of containers) usage.set(c.ImageID, (usage.get(c.ImageID) ?? 0) + 1);
    return images
      .map((img) => toImageSummary(img, usage))
      .sort((a, b) => a.repository.localeCompare(b.repository) || a.tag.localeCompare(b.tag));
  });

  app.post<{ Body: { image: string } }>(
    "/api/images/pull",
    {
      schema: {
        body: {
          type: "object",
          required: ["image"],
          properties: { image: { type: "string", pattern: IMAGE_REF } },
        },
      },
    },
    async (req) => {
      const ref = withDefaultTag(req.body.image.trim());
      await pullImage(docker, ref);
      return { ok: true, image: ref };
    },
  );

  app.delete<{ Params: { id: string }; Querystring: { force: boolean } }>(
    "/api/images/:id",
    {
      schema: {
        params: { type: "object", required: ["id"], properties: { id: { type: "string", pattern: IMAGE_ID } } },
        querystring: forceQuery,
      },
    },
    async (req) => {
      await docker.getImage(req.params.id).remove({ force: req.query.force });
      return { ok: true };
    },
  );

  app.post<{ Body: { all?: boolean } | undefined }>(
    "/api/images/prune",
    { schema: { body: { type: ["object", "null"], properties: { all: { type: "boolean" } } } } },
    async (req): Promise<PruneResult> => {
      // dangling=false removes every image without a container; dangling=true only untagged ones.
      const dangling = req.body?.all ? "false" : "true";
      const res = await docker.pruneImages({ filters: { dangling: { [dangling]: true } } });
      return { reclaimed: res.SpaceReclaimed ?? 0, deleted: res.ImagesDeleted?.length ?? 0 };
    },
  );
}
