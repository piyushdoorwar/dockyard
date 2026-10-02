import type Docker from "dockerode";
import type { FastifyInstance } from "fastify";
import { HttpError, isNotModified } from "../errors.js";
import { isSelf, toContainerSummary } from "../mappers.js";
import { forceQuery, idParams } from "./schemas.js";

export const CONTAINER_ACTIONS = ["start", "stop", "restart"] as const;
export type ContainerAction = (typeof CONTAINER_ACTIONS)[number];

export const SELF_PROTECTION_MESSAGE =
  "Dockyard can't stop or remove its own container. Stop or replace it from your host terminal.";

/** Run start/stop/restart, treating "already in that state" (304) as success. */
export async function runContainerAction(container: Docker.Container, action: ContainerAction): Promise<void> {
  try {
    if (action === "start") await container.start();
    else if (action === "stop") await container.stop();
    else await container.restart();
  } catch (err) {
    if (!isNotModified(err)) throw err;
  }
}

export function containerRoutes(app: FastifyInstance, docker: Docker): void {
  app.get("/api/containers", async () => {
    const list = await docker.listContainers({ all: true });
    return list.map(toContainerSummary).sort((a, b) => a.name.localeCompare(b.name));
  });

  app.get<{ Params: { id: string } }>("/api/containers/:id", { schema: { params: idParams } }, async (req) => {
    return docker.getContainer(req.params.id).inspect();
  });

  app.post<{ Params: { id: string; action: ContainerAction } }>(
    "/api/containers/:id/:action",
    {
      schema: {
        params: {
          type: "object",
          required: ["id", "action"],
          properties: { ...idParams.properties, action: { type: "string", enum: [...CONTAINER_ACTIONS] } },
        },
      },
    },
    async (req) => {
      const container = docker.getContainer(req.params.id);
      if (req.params.action !== "start") {
        const info = await container.inspect();
        if (isSelf(info.Config?.Labels)) throw new HttpError(409, SELF_PROTECTION_MESSAGE);
      }
      await runContainerAction(container, req.params.action);
      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string }; Querystring: { force: boolean } }>(
    "/api/containers/:id",
    { schema: { params: idParams, querystring: forceQuery } },
    async (req) => {
      const container = docker.getContainer(req.params.id);
      const info = await container.inspect();
      if (isSelf(info.Config?.Labels)) throw new HttpError(409, SELF_PROTECTION_MESSAGE);
      await container.remove({ force: req.query.force });
      return { ok: true };
    },
  );
}
