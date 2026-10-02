import Docker from "dockerode";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";

// Run outside Docker on loopback by default. Container users can opt into
// 0.0.0.0 while still publishing the port to 127.0.0.1 on the host.
const port = Number(process.env.PORT ?? 41739);
const host = process.env.HOST ?? "127.0.0.1";
const here = dirname(fileURLToPath(import.meta.url));
// Compiled to dist/server/src/index.js; the UI build lives in dist/web.
const webRoot = process.env.WEB_ROOT ?? resolve(here, "../../web");

const app = await buildApp({
  docker: new Docker(), // honours DOCKER_HOST, defaults to /var/run/docker.sock
  webRoot,
  appVersion: process.env.APP_VERSION ?? "dev",
  logger: true,
  workspaceRoot: process.env.DOCKYARD_WORKSPACE ?? process.cwd(),
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}

await app.listen({ port, host });
