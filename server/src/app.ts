import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import type Docker from "dockerode";
import Fastify, { type FastifyInstance } from "fastify";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { toHttpError } from "./errors.js";
import { agentRoutes } from "./routes/agents.js";
import { diagnosticsRoutes } from "./routes/diagnostics.js";
import { containerRoutes } from "./routes/containers.js";
import { composeRoutes } from "./routes/compose.js";
import { imageRoutes } from "./routes/images.js";
import { networkingRoutes } from "./routes/networking.js";
import { liveRoutes } from "./routes/live.js";
import { stackRoutes } from "./routes/stacks.js";
import { systemRoutes } from "./routes/system.js";
import { volumeRoutes } from "./routes/volumes.js";
import { registerSecurity } from "./security.js";

export interface AppOptions {
  docker: Docker;
  /** Built UI (dist/web). Omit in tests / dev, where Vite serves the UI. */
  webRoot?: string;
  appVersion?: string;
  logger?: boolean;
  workspaceRoot?: string;
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 64 * 1024 });

  registerSecurity(app);

  app.setErrorHandler((err, _req, reply) => {
    if ((err as { validation?: unknown }).validation) {
      return reply.code(400).send({ error: (err as Error).message });
    }
    const { statusCode, message } = toHttpError(err);
    if (statusCode >= 500) app.log.error(err);
    return reply.code(statusCode).send({ error: message });
  });

  await app.register(fastifyWebsocket);

  systemRoutes(app, opts.docker, opts.appVersion ?? "dev");
  containerRoutes(app, opts.docker);
  diagnosticsRoutes(app, opts.docker);
  stackRoutes(app, opts.docker);
  imageRoutes(app, opts.docker);
  networkingRoutes(app, opts.docker);
  volumeRoutes(app, opts.docker);
  liveRoutes(app, opts.docker);
  agentRoutes(app, opts.workspaceRoot ?? process.cwd());
  composeRoutes(app, opts.docker, opts.workspaceRoot ?? process.cwd());

  const webRoot = opts.webRoot && existsSync(join(opts.webRoot, "index.html")) ? opts.webRoot : undefined;
  if (webRoot) {
    await app.register(fastifyStatic, { root: webRoot });
  }

  // Client-side routes (/containers/abc, /images, ...) all load the SPA shell.
  app.setNotFoundHandler((req, reply) => {
    if (webRoot && req.method === "GET" && !req.url.startsWith("/api/")) {
      return reply.sendFile("index.html");
    }
    return reply.code(404).send({ error: "Not found" });
  });

  return app;
}
