import type Docker from "dockerode";
import type { FastifyInstance } from "fastify";
import { existsSync } from "node:fs";
import { hostname } from "node:os";
import { basename, dirname, join, normalize, relative, resolve } from "node:path";
import type { ComposeManifest, ComposeProject } from "../../../shared/types.js";
import { discoverCompose, inside, type DiscoveredProject } from "../compose/discovery.js";
import { previewCompose, type ComposeRunner } from "../compose/preview.js";
import { HttpError } from "../errors.js";
import { toContainerSummary } from "../mappers.js";

/** Match source files, not a directory basename: different repositories often share project names. */
export function matchingContainers(containers: Docker.ContainerInfo[], hostDirectory: string | null, files: string[]): Docker.ContainerInfo[] {
  if (!hostDirectory) return [];
  const expected = files.map((file) => normalize(join(hostDirectory, file)));
  return containers.filter((c) => {
    if (!c.Labels["com.docker.compose.project"] || c.Labels["com.docker.compose.oneoff"]?.toLowerCase() === "true") return false;
    const config = c.Labels["com.docker.compose.project.config_files"];
    if (!config) return false;
    // File order changes merge semantics, so the same set in another order is not a match.
    const actual = config.split(",").map((file) => normalize(file));
    return actual.length === expected.length && actual.every((file, i) => file === expected[i]);
  });
}

export function hostWorkspace(root: string, containers: Docker.ContainerInfo[]): string | null {
  const self = containers.find((c) => c.Labels["com.dockyard.runtime"] === "true" && c.Id.startsWith(hostname()));
  const mount = self?.Mounts?.filter((m) => m.Type === "bind" && m.Source && inside(m.Destination, root))
    .sort((a, b) => b.Destination.length - a.Destination.length)[0];
  if (mount?.Source) return resolve(mount.Source, relative(mount.Destination, root));
  return existsSync("/.dockerenv") ? null : root;
}

export function composeRoutes(app: FastifyInstance, docker: Docker, workspaceRoot: string, runner?: ComposeRunner): void {
  const root = resolve(workspaceRoot);
  let cached: { at: number; value: Promise<ComposeManifest> } | undefined;
  let active = 0;
  const waiting: (() => void)[] = [];
  async function limited<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= 2) {
      if (waiting.length >= 16) throw new HttpError(503, "Compose previews are busy. Try again shortly.");
      await new Promise<void>((done) => waiting.push(done));
    } else active++;
    try { return await fn(); }
    finally {
      const next = waiting.shift();
      if (next) next(); else active--;
    }
  }
  async function engine() {
    try { return { containers: await docker.listContainers({ all: true }), available: true }; }
    catch { return { containers: [] as Docker.ContainerInfo[], available: false }; }
  }
  async function project(entry: DiscoveredProject, state: Awaited<ReturnType<typeof engine>>, skipPreview = false): Promise<ComposeProject> {
    const hostRoot = hostWorkspace(root, state.containers);
    const hostDirectory = hostRoot ? resolve(hostRoot, entry.directory) : null;
    const defaultName = basename(hostDirectory ?? resolve(root, entry.directory)).toLowerCase().replace(/[^a-z0-9_-]/g, "").replace(/^[^a-z0-9]+/, "") || "workspace";
    const preview = skipPreview
      ? { name: defaultName, services: [], profiles: [], resolved: false, issues: ["Scan preview time limit reached. Open this project to preview it individually."] }
      : await limited(() => previewCompose(root, entry.directory, entry.selectedFiles, defaultName, runner));
    const containers = matchingContainers(state.containers, hostDirectory, entry.selectedFiles).map(toContainerSummary);
    const running = containers.filter((c) => c.state === "running").length;
    const requiredServicesRunning = preview.services.filter((s) => !s.profiles.length)
      .every((s) => containers.some((c) => c.service === s.name && c.state === "running"));
    const issues = [...preview.issues];
    if (!state.available) issues.push("Docker engine is unavailable. Configuration discovery still works; runtime status is unknown.");
    else if (!hostRoot) issues.push("The workspace's host path could not be identified. Runtime matching is unavailable and the default project name may differ on the host.");
    return {
      ...entry, name: preview.name, configuration: preview.resolved ? "resolved" : "unresolved",
      services: preview.services, profiles: preview.profiles, issues, containers, hostDirectory,
      status: !state.available || !hostRoot ? "unknown" : !containers.length ? "not-created" : running === containers.length && requiredServicesRunning ? "running" : running ? "partial" : "stopped",
    };
  }
  async function manifest(): Promise<ComposeManifest> {
    const [discovery, state] = await Promise.all([discoverCompose(root), engine()]);
    const projects: ComposeProject[] = [];
    const deadline = Date.now() + 20_000;
    for (let i = 0; i < discovery.projects.length; i += 2) {
      projects.push(...await Promise.all(discovery.projects.slice(i, i + 2).map((entry) => project(entry, state, Date.now() > deadline))));
    }
    return { root, projects, warnings: discovery.warnings, scannedAt: new Date().toISOString() };
  }
  app.get<{ Querystring: { refresh?: string } }>("/api/compose", {
    schema: { querystring: { type: "object", properties: { refresh: { type: "string", enum: ["1"] } } } },
  }, async (req) => {
    if (!cached || Date.now() - cached.at > 5_000 || (req.query.refresh === "1" && cached.at !== Infinity)) {
      const entry = { at: Infinity, value: manifest() };
      cached = entry;
      entry.value.then(() => { entry.at = Date.now(); }, () => { if (cached === entry) cached = undefined; });
    }
    return cached.value;
  });
  app.get<{ Querystring: { file: string; override?: string } }>("/api/compose/preview", {
    schema: { querystring: {
      type: "object", required: ["file"], additionalProperties: false,
      properties: { file: { type: "string", minLength: 1, maxLength: 1024 }, override: { type: "string", maxLength: 255 } },
    } },
  }, async (req) => {
    const discovery = await discoverCompose(root);
    const path = resolve(root, req.query.file);
    const directory = relative(root, dirname(path)) || ".";
    const entry = discovery.projects.find((p) => p.directory === directory && p.files.includes(basename(path)));
    if (!inside(root, path) || !entry) throw new HttpError(404, "Compose file not found in the workspace.");
    const overlay = req.query.override;
    if (overlay && (!entry.files.includes(overlay) || overlay === basename(path))) throw new HttpError(400, "Select a different discovered override file from this project.");
    return project({ ...entry, selectedFiles: [basename(path), ...(overlay ? [overlay] : [])] }, await engine());
  });
}
