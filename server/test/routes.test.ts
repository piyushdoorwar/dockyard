import type { FastifyInstance } from "fastify";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SELF_PROTECTION_MESSAGE } from "../src/routes/containers.js";
import { appWith, dockerError, fakeContainer, fakeDocker, MUTATE, rawContainer } from "./helpers.js";

let app: FastifyInstance;
afterEach(() => app?.close());

const compose = (project: string, service: string) => ({
  "com.docker.compose.project": project,
  "com.docker.compose.service": service,
});

describe("containers", () => {
  it("lists containers sorted by name", async () => {
    const { asDocker } = fakeDocker({
      listContainers: vi.fn().mockResolvedValue([
        rawContainer({ Id: "2", Names: ["/zeta"] }),
        rawContainer({ Id: "1", Names: ["/alpha"] }),
      ]),
    });
    app = await appWith(asDocker);
    const res = await app.inject({ url: "/api/containers" });
    expect(res.statusCode).toBe(200);
    expect(res.json().map((c: { name: string }) => c.name)).toEqual(["alpha", "zeta"]);
  });

  it.each(["start", "stop", "restart"] as const)("%s calls Docker", async (action) => {
    const { asDocker, containers } = fakeDocker();
    containers.set("web", fakeContainer());
    app = await appWith(asDocker);
    const res = await app.inject({ method: "POST", url: `/api/containers/web/${action}`, headers: MUTATE });
    expect(res.statusCode).toBe(200);
    expect(containers.get("web")![action]).toHaveBeenCalledOnce();
  });

  it("treats 'already started' (304) as success", async () => {
    const { asDocker, containers } = fakeDocker();
    const c = fakeContainer();
    c.start.mockRejectedValue(dockerError(304, "container already started"));
    containers.set("web", c);
    app = await appWith(asDocker);
    const res = await app.inject({ method: "POST", url: "/api/containers/web/start", headers: MUTATE });
    expect(res.statusCode).toBe(200);
  });

  it("refuses to stop or delete its own container", async () => {
    const { asDocker, containers } = fakeDocker();
    const self = fakeContainer({ "com.dockyard.runtime": "true" });
    containers.set("me", self);
    app = await appWith(asDocker);

    const stop = await app.inject({ method: "POST", url: "/api/containers/me/stop", headers: MUTATE });
    expect(stop.statusCode).toBe(409);
    expect(stop.json().error).toBe(SELF_PROTECTION_MESSAGE);

    const del = await app.inject({ method: "DELETE", url: "/api/containers/me", headers: MUTATE });
    expect(del.statusCode).toBe(409);
    expect(self.stop).not.toHaveBeenCalled();
    expect(self.remove).not.toHaveBeenCalled();
  });

  it("deletes with ?force=true", async () => {
    const { asDocker, containers } = fakeDocker();
    containers.set("web", fakeContainer());
    app = await appWith(asDocker);
    const res = await app.inject({ method: "DELETE", url: "/api/containers/web?force=true", headers: MUTATE });
    expect(res.statusCode).toBe(200);
    expect(containers.get("web")!.remove).toHaveBeenCalledWith({ force: true });
  });

  it("passes Docker's 404 through with its message", async () => {
    const { asDocker, containers } = fakeDocker();
    const c = fakeContainer();
    c.inspect.mockRejectedValue(dockerError(404, "No such container: nope"));
    containers.set("nope", c);
    app = await appWith(asDocker);
    const res = await app.inject({ url: "/api/containers/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "No such container: nope" });
  });

  it.each([
    ["an unknown action", "/api/containers/web/kill"],
    ["a malformed id", "/api/containers/..%2Fetc/start"],
  ])("rejects %s with 400", async (_label, url) => {
    const { asDocker, docker } = fakeDocker();
    app = await appWith(asDocker);
    const res = await app.inject({ method: "POST", url, headers: MUTATE });
    expect(res.statusCode).toBe(400);
    expect(docker.getContainer).not.toHaveBeenCalled();
  });
});

describe("stacks", () => {
  it("groups compose containers into stacks", async () => {
    const { asDocker } = fakeDocker({
      listContainers: vi.fn().mockResolvedValue([
        rawContainer({ Id: "1", Names: ["/sample-api-1"], Labels: compose("sample", "api") }),
        rawContainer({ Id: "2", Names: ["/sample-db-1"], Labels: compose("sample", "db"), State: "exited" }),
        rawContainer({ Id: "3", Names: ["/standalone"] }),
      ]),
    });
    app = await appWith(asDocker);
    const res = await app.inject({ url: "/api/stacks" });
    expect(res.json()).toMatchObject([{ name: "sample", status: "partial", running: 1, total: 2 }]);
  });

  it("stops every container in the stack and reports each result", async () => {
    const listContainers = vi.fn().mockResolvedValue([
      rawContainer({ Id: "api", Names: ["/sample-api-1"], Labels: compose("sample", "api") }),
      rawContainer({ Id: "db", Names: ["/sample-db-1"], Labels: compose("sample", "db") }),
    ]);
    const { asDocker, containers } = fakeDocker({ listContainers });
    const db = fakeContainer();
    db.stop.mockRejectedValue(dockerError(500, "boom"));
    containers.set("db", db);
    app = await appWith(asDocker);

    const res = await app.inject({ method: "POST", url: "/api/stacks/sample/stop", headers: MUTATE });
    expect(res.statusCode).toBe(200);
    expect(listContainers).toHaveBeenCalledWith({ all: true, filters: { label: ["com.docker.compose.project=sample"] } });
    expect(res.json().results).toEqual([
      { id: "api", name: "sample-api-1", ok: true },
      { id: "db", name: "sample-db-1", ok: false, error: "boom" },
    ]);
    expect(containers.has("me")).toBe(false);
  });

  it.each(["stop", "restart", "start", "delete"])("rejects %s for the whole stack when it contains Dockyard", async (action) => {
    const { asDocker, docker } = fakeDocker({ listContainers: vi.fn().mockResolvedValue([
      rawContainer({ Id: "api", Labels: compose("sample", "api") }),
      rawContainer({ Id: "me", Labels: { ...compose("sample", "dockyard"), "com.dockyard.runtime": "true" } }),
    ]) });
    app = await appWith(asDocker);
    const res = await app.inject({ method: action === "delete" ? "DELETE" : "POST",
      url: `/api/stacks/sample${action === "delete" ? "" : `/${action}`}`, headers: MUTATE });
    expect(res.statusCode).toBe(409);
    expect(docker.getContainer).not.toHaveBeenCalled();
  });

  it("404s for an unknown stack", async () => {
    app = await appWith(fakeDocker().asDocker);
    const res = await app.inject({ method: "POST", url: "/api/stacks/ghost/start", headers: MUTATE });
    expect(res.statusCode).toBe(404);
  });

  it("removes stack containers with force", async () => {
    const { asDocker, containers } = fakeDocker({
      listContainers: vi.fn().mockResolvedValue([rawContainer({ Id: "api", Labels: compose("sample", "api") })]),
    });
    app = await appWith(asDocker);
    const res = await app.inject({ method: "DELETE", url: "/api/stacks/sample", headers: MUTATE });
    expect(res.statusCode).toBe(200);
    expect(containers.get("api")!.remove).toHaveBeenCalledWith({ force: true });
  });

  it("rejects invalid stack names", async () => {
    app = await appWith(fakeDocker().asDocker);
    const res = await app.inject({ method: "POST", url: "/api/stacks/Bad%20Name/start", headers: MUTATE });
    expect(res.statusCode).toBe(400);
  });
});

describe("images", () => {
  it("lists images with how many containers use each", async () => {
    const { asDocker } = fakeDocker({
      listImages: vi.fn().mockResolvedValue([
        { Id: "sha256:aaaaaaaaaaaa1", RepoTags: ["redis:7"], Size: 100, Created: 1 },
        { Id: "sha256:bbbbbbbbbbbb2", RepoTags: ["<none>:<none>"], Size: 50, Created: 2 },
      ]),
      listContainers: vi.fn().mockResolvedValue([
        rawContainer({ Id: "1", ImageID: "sha256:aaaaaaaaaaaa1" }),
        rawContainer({ Id: "2", ImageID: "sha256:aaaaaaaaaaaa1" }),
      ]),
    });
    app = await appWith(asDocker);
    const body = (await app.inject({ url: "/api/images" })).json();
    expect(body).toMatchObject([
      { repository: "<none>", dangling: true, containers: 0 },
      { repository: "redis", tag: "7", containers: 2 },
    ]);
  });

  it("pulls an image, defaulting to :latest", async () => {
    const followProgress = vi.fn((_s, done) => done(null, [{ status: "Downloaded" }]));
    const pull = vi.fn((_ref, cb) => cb(null, {}));
    const { asDocker } = fakeDocker({ pull, modem: { followProgress } });
    app = await appWith(asDocker);
    const res = await app.inject({ method: "POST", url: "/api/images/pull", headers: MUTATE, payload: { image: "nginx" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, image: "nginx:latest" });
    expect(pull).toHaveBeenCalledWith("nginx:latest", expect.any(Function));
  });

  it("reports a pull that fails part-way", async () => {
    const followProgress = vi.fn((_s, done) => done(null, [{ error: "manifest unknown" }]));
    const { asDocker } = fakeDocker({ pull: vi.fn((_r, cb) => cb(null, {})), modem: { followProgress } });
    app = await appWith(asDocker);
    const res = await app.inject({ method: "POST", url: "/api/images/pull", headers: MUTATE, payload: { image: "nope:1" } });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe("manifest unknown");
  });

  it.each(["", "-rf", "a b", "$(whoami)"])("rejects image ref %j", async (image) => {
    const { asDocker, docker } = fakeDocker();
    app = await appWith(asDocker);
    const res = await app.inject({ method: "POST", url: "/api/images/pull", headers: MUTATE, payload: { image } });
    expect(res.statusCode).toBe(400);
    expect(docker.pull).not.toHaveBeenCalled();
  });

  it("deletes an image, passing force", async () => {
    const remove = vi.fn().mockResolvedValue([]);
    const { asDocker, docker } = fakeDocker({ getImage: vi.fn(() => ({ remove })) });
    app = await appWith(asDocker);
    const res = await app.inject({ method: "DELETE", url: "/api/images/sha256:abcdef123456?force=true", headers: MUTATE });
    expect(res.statusCode).toBe(200);
    expect(docker.getImage).toHaveBeenCalledWith("sha256:abcdef123456");
    expect(remove).toHaveBeenCalledWith({ force: true });
  });

  it("prunes dangling images by default and all unused when asked", async () => {
    const pruneImages = vi.fn().mockResolvedValue({ ImagesDeleted: [{}, {}], SpaceReclaimed: 42 });
    const { asDocker } = fakeDocker({ pruneImages });
    app = await appWith(asDocker);

    const dangling = await app.inject({ method: "POST", url: "/api/images/prune", headers: MUTATE });
    expect(dangling.json()).toEqual({ reclaimed: 42, deleted: 2 });
    expect(pruneImages).toHaveBeenLastCalledWith({ filters: { dangling: { true: true } } });

    await app.inject({ method: "POST", url: "/api/images/prune", headers: MUTATE, payload: { all: true } });
    expect(pruneImages).toHaveBeenLastCalledWith({ filters: { dangling: { false: true } } });
  });
});

describe("volumes", () => {
  it("lists volumes with sizes from volume-only disk usage", async () => {
    const dial = vi.fn((_opts, cb) => cb(null, { Volumes: [{ Name: "pgdata", UsageData: { Size: 2048, RefCount: 1 } }] }));
    const { asDocker, docker } = fakeDocker({
      listVolumes: vi.fn().mockResolvedValue({
        Volumes: [{ Name: "pgdata", Driver: "local", Mountpoint: "/v", Labels: { "com.docker.compose.project": "sample" } }],
      }),
      modem: { followProgress: vi.fn(), dial },
    });
    app = await appWith(asDocker);
    expect((await app.inject({ url: "/api/volumes" })).json()).toMatchObject([
      { name: "pgdata", size: 2048, refCount: 1, project: "sample" },
    ]);
    // Asks only for volumes rather than sizing every image and container.
    expect(dial).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/system/df?", options: { type: ["volume"] } }),
      expect.any(Function),
    );
    expect(docker.df).not.toHaveBeenCalled();
  });

  it("answers 503 when the Docker socket isn't there", async () => {
    const unreachable = Object.assign(new Error("connect ENOENT /var/run/docker.sock"), {
      code: "ENOENT",
      syscall: "connect",
    });
    const { asDocker } = fakeDocker({ listVolumes: vi.fn().mockRejectedValue(unreachable) });
    app = await appWith(asDocker);
    const res = await app.inject({ url: "/api/volumes" });
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toMatch(/Docker engine/);
  });

  it("surfaces Docker's 'volume in use' conflict", async () => {
    const remove = vi.fn().mockRejectedValue(dockerError(409, "volume is in use"));
    const { asDocker } = fakeDocker({ getVolume: vi.fn(() => ({ remove })) });
    app = await appWith(asDocker);
    const res = await app.inject({ method: "DELETE", url: "/api/volumes/pgdata", headers: MUTATE });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe("volume is in use");
  });

  it("prunes named and anonymous unused volumes", async () => {
    const { asDocker, docker } = fakeDocker();
    app = await appWith(asDocker);
    await app.inject({ method: "POST", url: "/api/volumes/prune", headers: MUTATE });
    expect(docker.pruneVolumes).toHaveBeenCalledWith({ filters: { all: ["true"] } });
  });
});

describe("system", () => {
  it("summarises engine info", async () => {
    const { asDocker } = fakeDocker({
      info: vi.fn().mockResolvedValue({
        Name: "dev-box", ServerVersion: "29.0.0", OperatingSystem: "Ubuntu 24.04", KernelVersion: "6.8",
        Architecture: "x86_64", NCPU: 8, MemTotal: 16e9, Containers: 5, ContainersRunning: 3,
        ContainersPaused: 0, ContainersStopped: 2, Images: 9,
      }),
    });
    app = await appWith(asDocker);
    expect((await app.inject({ url: "/api/system" })).json()).toMatchObject({
      serverVersion: "29.0.0",
      containers: { total: 5, running: 3, stopped: 2 },
      images: 9,
      appVersion: "test",
    });
  });

  it("clean-up never touches volumes", async () => {
    const { asDocker, docker } = fakeDocker({
      pruneContainers: vi.fn().mockResolvedValue({ ContainersDeleted: ["a"], SpaceReclaimed: 10 }),
      pruneImages: vi.fn().mockResolvedValue({ ImagesDeleted: [{}], SpaceReclaimed: 20 }),
      pruneBuilder: vi.fn().mockResolvedValue({ CachesDeleted: ["c"], SpaceReclaimed: 30 }),
    });
    app = await appWith(asDocker);
    const res = await app.inject({ method: "POST", url: "/api/system/prune", headers: MUTATE });
    expect(res.json()).toEqual({ reclaimed: 60, deleted: 3 });
    expect(docker.pruneVolumes).not.toHaveBeenCalled();
  });
});

describe("static UI", () => {
  function webRoot() {
    const dir = mkdtempSync(join(tmpdir(), "sidm-web-"));
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>Dockyard</title>");
    return dir;
  }

  it("serves the SPA shell for client-side routes", async () => {
    app = await appWith(fakeDocker().asDocker, webRoot());
    const res = await app.inject({ url: "/containers/abc" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Dockyard");
  });

  it("keeps unknown API paths as JSON 404s", async () => {
    app = await appWith(fakeDocker().asDocker, webRoot());
    const res = await app.inject({ url: "/api/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Not found" });
  });
});
