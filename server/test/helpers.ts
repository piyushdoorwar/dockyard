import type Docker from "dockerode";
import type { FastifyInstance } from "fastify";
import { vi } from "vitest";
import { buildApp } from "../src/app.js";
import { CSRF_HEADER } from "../../shared/types.js";

/** A container as `GET /containers/json` returns it. */
export function rawContainer(over: Partial<Docker.ContainerInfo> & { Id: string }): Docker.ContainerInfo {
  return {
    Names: [`/${over.Id}`],
    Image: "nginx:latest",
    ImageID: "sha256:img1",
    Command: "",
    Created: 1_700_000_000,
    Ports: [],
    Labels: {},
    State: "running",
    Status: "Up 1 hour",
    HostConfig: { NetworkMode: "bridge" },
    NetworkSettings: { Networks: {} },
    Mounts: [],
    ...over,
  } as Docker.ContainerInfo;
}

export interface FakeContainer {
  inspect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  restart: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  logs: ReturnType<typeof vi.fn>;
  stats: ReturnType<typeof vi.fn>;
  exec: ReturnType<typeof vi.fn>;
}

export function fakeContainer(labels: Record<string, string> = {}, tty = false): FakeContainer {
  return {
    inspect: vi.fn().mockResolvedValue({ Id: "abc", Config: { Labels: labels, Tty: tty } }),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    logs: vi.fn(),
    stats: vi.fn(),
    exec: vi.fn(),
  };
}

/** Just enough of dockerode for the routes under test; override per test. */
export function fakeDocker(over: Record<string, unknown> = {}) {
  const containers = new Map<string, FakeContainer>();
  const docker = {
    listContainers: vi.fn().mockResolvedValue([]),
    listImages: vi.fn().mockResolvedValue([]),
    listVolumes: vi.fn().mockResolvedValue({ Volumes: [], Warnings: [] }),
    df: vi.fn().mockResolvedValue({ LayersSize: 0, Images: [], Containers: [], Volumes: [], BuildCache: [] }),
    info: vi.fn(),
    pull: vi.fn(),
    modem: { followProgress: vi.fn() },
    pruneContainers: vi.fn().mockResolvedValue({ ContainersDeleted: [], SpaceReclaimed: 0 }),
    pruneImages: vi.fn().mockResolvedValue({ ImagesDeleted: [], SpaceReclaimed: 0 }),
    pruneNetworks: vi.fn().mockResolvedValue({ NetworksDeleted: [] }),
    pruneVolumes: vi.fn().mockResolvedValue({ VolumesDeleted: [], SpaceReclaimed: 0 }),
    pruneBuilder: vi.fn().mockResolvedValue({ CachesDeleted: [], SpaceReclaimed: 0 }),
    getImage: vi.fn(),
    getVolume: vi.fn(),
    getContainer: vi.fn((id: string) => {
      if (!containers.has(id)) containers.set(id, fakeContainer());
      return containers.get(id);
    }),
    ...over,
  };
  return { docker, containers, asDocker: docker as unknown as Docker };
}

export async function appWith(docker: Docker, webRoot?: string): Promise<FastifyInstance> {
  const app = await buildApp({ docker, webRoot, appVersion: "test" });
  await app.ready();
  return app;
}

/** Headers a real browser on Dockyard page would send for a mutating call. */
export const MUTATE = { [CSRF_HEADER]: "1" };

export function dockerError(statusCode: number, message: string) {
  return Object.assign(new Error(`(HTTP code ${statusCode}) ${message}`), { statusCode, json: { message } });
}
