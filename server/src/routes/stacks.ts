import type Docker from "dockerode";
import type { FastifyInstance } from "fastify";
import type { BulkResult } from "../../../shared/types.js";
import { HttpError, toHttpError } from "../errors.js";
import { groupStacks, PROJECT_LABEL, toContainerSummary } from "../mappers.js";
import { CONTAINER_ACTIONS, type ContainerAction, runContainerAction } from "./containers.js";
import { PROJECT_NAME } from "./schemas.js";

const nameParams = {
  type: "object",
  required: ["name"],
  properties: { name: { type: "string", pattern: PROJECT_NAME } },
} as const;

/**
 * Stacks are compose projects, found via the labels compose puts on each
 * container. Acting on a stack acts on its existing containers — we don't run
 * `docker compose` (that needs the compose file, which lives on the host).
 */
export function stackRoutes(app: FastifyInstance, docker: Docker): void {
  async function stackContainers(name: string) {
    const list = await docker.listContainers({ all: true, filters: { label: [`${PROJECT_LABEL}=${name}`] } });
    const containers = list.map(toContainerSummary).filter((c) => !c.isSelf);
    if (containers.length === 0) throw new HttpError(404, `No containers found for stack "${name}".`);
    return containers;
  }

  async function forEach(
    name: string,
    fn: (c: Docker.Container) => Promise<void>,
  ): Promise<BulkResult> {
    const containers = await stackContainers(name);
    const settled = await Promise.allSettled(containers.map((c) => fn(docker.getContainer(c.id))));
    return {
      results: containers.map((c, i) => {
        const r = settled[i];
        return r.status === "fulfilled"
          ? { id: c.id, name: c.name, ok: true }
          : { id: c.id, name: c.name, ok: false, error: toHttpError(r.reason).message };
      }),
    };
  }

  app.get("/api/stacks", async () => {
    const list = await docker.listContainers({ all: true });
    return groupStacks(list.map(toContainerSummary));
  });

  app.post<{ Params: { name: string; action: ContainerAction } }>(
    "/api/stacks/:name/:action",
    {
      schema: {
        params: {
          type: "object",
          required: ["name", "action"],
          properties: { ...nameParams.properties, action: { type: "string", enum: [...CONTAINER_ACTIONS] } },
        },
      },
    },
    async (req) => forEach(req.params.name, (c) => runContainerAction(c, req.params.action)),
  );

  app.delete<{ Params: { name: string } }>("/api/stacks/:name", { schema: { params: nameParams } }, async (req) =>
    forEach(req.params.name, (c) => c.remove({ force: true })),
  );
}
