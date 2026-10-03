import Fastify from "fastify";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync, existsSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverCompose, MAX_FILE_BYTES } from "../src/compose/discovery.js";
import { previewCompose, type ComposeRunner } from "../src/compose/preview.js";
import { composeRoutes, matchingContainers } from "../src/routes/compose.js";
import { fakeDocker, rawContainer } from "./helpers.js";

const roots: string[] = [];
function workspace(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "dockyard-compose-test-"));
  roots.push(root);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, name)), { recursive: true });
    writeFileSync(join(root, name), content);
  }
  return root;
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true }); });
const config = "services:\n  api:\n    image: nginx:alpine\n";
const runner: ComposeRunner = async () => ({ stdout: JSON.stringify({ name: "demo", services: { api: { image: "nginx:alpine", environment: { SECRET: "hidden" }, ports: [{ target: 80, published: "8080", protocol: "tcp" }], profiles: ["web"] } } }), stderr: "" });

describe("Compose discovery", () => {
  it("groups nested projects, uses Compose precedence, and detects named variants", async () => {
    const root = workspace({ "compose.yaml": config, "compose.yml": config, "compose.override.yaml": config,
      "compose.prod.yaml": config, "packages/api/docker-compose.yml": config, "tools/compose.dev.yml": config,
      "node_modules/demo/compose.yaml": config, ".git/compose.yaml": config, "dist/compose.yaml": config });
    symlinkSync(root, join(root, "loop"));
    symlinkSync(join(root, "compose.yaml"), join(root, "compose.link.yaml"));
    const result = await discoverCompose(root);
    expect(result.projects.map((p) => p.directory)).toEqual([".", "packages/api", "tools"]);
    expect(result.projects[0].selectedFiles).toEqual(["compose.yaml", "compose.override.yaml"]);
    expect(result.projects[0].files).not.toContain("compose.link.yaml");
    expect(result.projects[2].selectedFiles).toEqual(["compose.dev.yml"]);
  });
  it("reports missing workspaces, orphan overrides, and depth limits", async () => {
    const root = workspace({ "compose.override.yml": config, [`${"nested/".repeat(14)}compose.yaml`]: config });
    const result = await discoverCompose(root);
    expect(result.projects).toHaveLength(1);
    expect(result.warnings[0]).toContain("Scan limit");
    expect((await discoverCompose(join(root, "absent"))).warnings[0]).toContain("missing or unreadable");
  });
});

describe("Compose preview isolation", () => {
  it("returns only service summaries and removes the temporary snapshot", async () => {
    const root = workspace({ "compose.yaml": config, ".env": "PASSWORD=hidden\n" });
    let temporary = "";
    const run = vi.fn<ComposeRunner>(async (args, cwd, home) => {
      temporary = home;
      expect(args).toContain("config");
      expect(args).toContain("--no-env-resolution");
      expect(args).not.toContain("up");
      expect(cwd).not.toBe(root);
      expect(existsSync(join(cwd, ".env"))).toBe(true);
      return runner(args, cwd, home);
    });
    const preview = await previewCompose(root, ".", ["compose.yaml"], "demo", run);
    expect(preview.resolved).toBe(true);
    expect(preview.services[0]).toMatchObject({ name: "api", ports: ["8080:80/tcp"], profiles: ["web"] });
    expect(JSON.stringify(preview)).not.toContain("hidden");
    expect(existsSync(temporary)).toBe(false);
  });
  it("rejects oversized input and symlinked references before invoking Compose", async () => {
    const root = workspace({ "compose.yaml": "x".repeat(MAX_FILE_BYTES + 1) });
    const run = vi.fn(runner);
    expect((await previewCompose(root, ".", ["compose.yaml"], "demo", run)).issues[0]).toContain("512 KB");
    writeFileSync(join(root, "compose.yaml"), config + "    env_file: secret.env\n");
    const outside = workspace({ "secret.env": "PASSWORD=hidden" });
    symlinkSync(join(outside, "secret.env"), join(root, "secret.env"));
    expect((await previewCompose(root, ".", ["compose.yaml"], "demo", run)).issues[0]).toContain("Symlinked");
    expect(run).not.toHaveBeenCalled();
  });
  it.each([
    "include: https://example.com/compose.yaml\n",
    "include: ../outside.yaml\n",
    "include: ${REMOTE_FILE}\n",
    "include:\n  - path: child.yaml\n    project_directory: elsewhere\n",
    "services:\n  api:\n    extends:\n      file: /outside.yaml\n      service: api\n",
  ])("does not load unsafe or unsupported configuration references", async (content) => {
    const root = workspace({ "compose.yaml": content });
    const run = vi.fn(runner);
    expect((await previewCompose(root, ".", ["compose.yaml"], "demo", run)).resolved).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
  it("reports invalid YAML, missing files, and missing CLI without exposing raw errors", async () => {
    const root = workspace({ "compose.yaml": "services: [\n" });
    expect((await previewCompose(root, ".", ["compose.yaml"], "demo", runner)).issues[0]).toContain("Invalid YAML");
    writeFileSync(join(root, "compose.yaml"), config + "    env_file: missing.env\n");
    expect((await previewCompose(root, ".", ["compose.yaml"], "demo", runner)).issues[0]).toContain("missing.env");
    writeFileSync(join(root, "compose.yaml"), config);
    const unavailable: ComposeRunner = async () => { throw { code: "ENOENT", stderr: "SECRET=hidden" }; };
    expect((await previewCompose(root, ".", ["compose.yaml"], "demo", unavailable)).issues[0]).toContain("Compose is unavailable");
    const invalid: ComposeRunner = async () => { throw { stderr: "invalid config SECRET=hidden" }; };
    expect(JSON.stringify(await previewCompose(root, ".", ["compose.yaml"], "demo", invalid))).not.toContain("hidden");
  });
  it("marks missing interpolation variables unresolved even if Compose succeeds", async () => {
    const root = workspace({ "compose.yaml": config });
    const missing: ComposeRunner = async (...args) => ({ ...await runner(...args), stderr: 'The "APP_TAG" variable is not set. Defaulting to a blank string.' });
    const preview = await previewCompose(root, ".", ["compose.yaml"], "demo", missing);
    expect(preview.resolved).toBe(false);
    expect(preview.issues[0]).toContain("APP_TAG");
  });
});

describe("runtime matching", () => {
  it("matches exact source files, including custom project names, but not other checkouts or overrides", () => {
    const make = (id: string, files: string, oneoff = "False") => rawContainer({ Id: id, Labels: {
      "com.docker.compose.project": "custom-name", "com.docker.compose.project.config_files": files, "com.docker.compose.oneoff": oneoff,
    } });
    const containers = [make("correct", "/repos/api/compose.yaml,/repos/api/compose.dev.yaml"),
      make("other-checkout", "/repos/other/compose.yaml,/repos/other/compose.dev.yaml"),
      make("reversed", "/repos/api/compose.dev.yaml,/repos/api/compose.yaml"),
      make("different-config", "/repos/api/compose.yaml"), make("one-off", "/repos/api/compose.yaml,/repos/api/compose.dev.yaml", "True")];
    expect(matchingContainers(containers, "/repos/api", ["compose.yaml", "compose.dev.yaml"]).map((c) => c.Id)).toEqual(["correct"]);
    expect(matchingContainers(containers, null, ["compose.yaml"])).toEqual([]);
  });
});

describe("Compose routes", () => {
  it("maps the mounted host path and distinguishes incomplete, running, and stopped projects", async () => {
    const root = workspace({ "compose.yaml": config });
    const self = rawContainer({ Id: `${hostname()}-self`, Labels: { "com.dockyard.runtime": "true" },
      Mounts: [{ Type: "bind", Source: "/host/repo", Destination: root, Mode: "ro", RW: false, Propagation: "rprivate" }] });
    const service = (id: string, state = "running") => rawContainer({ Id: id, State: state, Labels: {
      "com.docker.compose.project": "custom", "com.docker.compose.service": id,
      "com.docker.compose.project.config_files": "/host/repo/compose.yaml",
    } });
    const fake = fakeDocker({ listContainers: vi.fn().mockResolvedValue([self, service("api")]) });
    const required: ComposeRunner = async () => ({ stdout: JSON.stringify({ services: { api: { image: "nginx" }, worker: { image: "busybox" } } }), stderr: "" });
    const app = Fastify();
    composeRoutes(app, fake.asDocker, root, required);
    try {
      const response = (await app.inject("/api/compose/preview?file=compose.yaml")).json();
      expect(response).toMatchObject({ hostDirectory: "/host/repo", status: "partial" });
      expect(response.containers.map((c: { id: string }) => c.id)).toEqual(["api"]);
      fake.docker.listContainers.mockResolvedValue([self, service("api"), service("worker")]);
      expect((await app.inject("/api/compose/preview?file=compose.yaml")).json().status).toBe("running");
      fake.docker.listContainers.mockResolvedValue([self, service("api", "exited"), service("worker", "exited")]);
      expect((await app.inject("/api/compose/preview?file=compose.yaml")).json().status).toBe("stopped");
    } finally { await app.close(); }
  });
  it("rescans immediately when requested instead of returning a cached file list", async () => {
    const root = workspace({ "compose.yaml": config });
    const app = Fastify();
    composeRoutes(app, fakeDocker().asDocker, root, runner);
    try {
      expect((await app.inject("/api/compose")).json().projects[0].files).toEqual(["compose.yaml"]);
      writeFileSync(join(root, "compose.dev.yaml"), config);
      expect((await app.inject("/api/compose?refresh=1")).json().projects[0].files).toEqual(["compose.dev.yaml", "compose.yaml"]);
    } finally { await app.close(); }
  });
  it("discovers with Docker offline, validates selections, and never mutates Docker", async () => {
    const root = workspace({ "compose.yaml": config, "compose.dev.yaml": config });
    const fake = fakeDocker({ listContainers: vi.fn().mockRejectedValue(new Error("offline")) });
    const app = Fastify();
    composeRoutes(app, fake.asDocker, root, runner);
    try {
      const result = await app.inject("/api/compose");
      expect(result.statusCode).toBe(200);
      expect(result.json().projects[0]).toMatchObject({ configuration: "resolved", status: "unknown" });
      expect((await app.inject("/api/compose/preview?file=compose.yaml&override=compose.dev.yaml")).json().selectedFiles).toEqual(["compose.yaml", "compose.dev.yaml"]);
      expect((await app.inject("/api/compose/preview?file=../../etc/passwd")).statusCode).toBe(404);
      expect((await app.inject("/api/compose/preview?file=compose.yaml&override=../other.yaml")).statusCode).toBe(400);
      expect((await app.inject("/api/compose/preview")).statusCode).toBe(400);
      expect(fake.docker.getContainer).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
});

const composeAvailable = spawnSync("docker", ["compose", "version"], { timeout: 5_000, stdio: "ignore" }).status === 0;
describe.skipIf(!composeAvailable)("real Compose configuration integration (no daemon required)", () => {
  it("merges overrides, resolves .env and profiles, and hides environment values", async () => {
    const root = workspace({
      "compose.yaml": 'name: sample\nservices:\n  api:\n    image: "nginx:${TAG:?set tag}"\n    ports: ["8080:80"]\n    environment:\n      PASSWORD: secret-value\n  worker:\n    image: busybox\n    profiles: [jobs]\n',
      "compose.override.yaml": 'services:\n  api:\n    image: "nginx:${TAG}-alpine"\n', ".env": "TAG=1.27\n",
    });
    const preview = await previewCompose(root, ".", ["compose.yaml", "compose.override.yaml"], "sample");
    expect(preview.issues).toEqual([]);
    expect(preview.services[0].image).toBe("nginx:1.27-alpine");
    expect(preview.profiles).toEqual(["jobs"]);
    expect(JSON.stringify(preview)).not.toContain("secret-value");
  });
  it("supports local includes and extends while preserving their relative paths", async () => {
    const root = workspace({
      "compose.yaml": 'include: ["child/compose.yaml"]\nservices:\n  api:\n    extends:\n      file: common.yaml\n      service: base\n',
      "common.yaml": "services:\n  base:\n    image: nginx:alpine\n",
      "child/compose.yaml": "services:\n  worker:\n    image: busybox\n",
    });
    const preview = await previewCompose(root, ".", ["compose.yaml"], "sample");
    expect(preview.issues).toEqual([]);
    expect(preview.services.map((s) => s.name)).toEqual(["api", "worker"]);
  });
  it("does not resolve required variables from the Dockyard process environment", async () => {
    const root = workspace({ "compose.yaml": 'services:\n  api:\n    image: "nginx:${DOCKYARD_TEST_SECRET:?required}"\n' });
    process.env.DOCKYARD_TEST_SECRET = "secret-tag";
    try {
      const preview = await previewCompose(root, ".", ["compose.yaml"], "sample");
      expect(preview.resolved).toBe(false);
      expect(JSON.stringify(preview)).not.toContain("secret-tag");
    } finally { delete process.env.DOCKYARD_TEST_SECRET; }
  });
  it("flags optional unset variables instead of presenting silently blank values as resolved", async () => {
    const root = workspace({ "compose.yaml": 'services:\n  api:\n    image: nginx:alpine\n    environment:\n      OPTIONAL: ${DOCKYARD_TEST_UNSET}\n' });
    const preview = await previewCompose(root, ".", ["compose.yaml"], "sample");
    expect(preview.resolved).toBe(false);
    expect(preview.issues[0]).toContain("DOCKYARD_TEST_UNSET");
  });
});
