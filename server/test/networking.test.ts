import { describe, expect, it, vi } from "vitest";
import { appWith, fakeDocker, rawContainer } from "./helpers.js";
import { readNetworking } from "../src/routes/networking.js";

const endpoint = { NetworkID: "net1", EndpointID: "ep1", IPAddress: "172.20.0.2", GlobalIPv6Address: "", Aliases: ["db"] };
const network = { Id: "net1", Name: "workspace", Driver: "bridge", Scope: "local", Internal: true, IPAM: { Config: [{ Subnet: "172.20.0.0/16", Gateway: "172.20.0.1" }] }, Options: { "com.docker.network.bridge.enable_icc": "false" }, Labels: { "com.docker.compose.project": "demo" } };

describe("networking snapshot", () => {
  it("preserves bind addresses and protocols, excludes exposed-only ports, and returns safe membership metadata", async () => {
    const c = rawContainer({ Id: "db", NetworkSettings: { Networks: { workspace: endpoint } } as any, Ports: [
      { IP: "0.0.0.0", PublicPort: 5432, PrivatePort: 5432, Type: "tcp" },
      { IP: "::", PublicPort: 5432, PrivatePort: 5432, Type: "tcp" },
      { IP: "127.0.0.1", PublicPort: 5432, PrivatePort: 5432, Type: "udp" },
      { PrivatePort: 80, Type: "tcp" } as any,
    ], Labels: { secret: "not-returned" } });
    const { asDocker } = fakeDocker({ listContainers: vi.fn().mockResolvedValue([c]), listNetworks: vi.fn().mockResolvedValue([network]) });
    const result = await readNetworking(asDocker);
    expect(result.ports).toHaveLength(3);
    expect(result.ports.map(p => p.hostIp)).toEqual(expect.arrayContaining(["::", "0.0.0.0", "127.0.0.1"]));
    expect(result.networks[0]).toMatchObject({ internal: true, communicationDisabled: true, containerIds: ["db"], project: "demo" });
    expect(result.containers[0].networks[0]).toMatchObject({ aliases: ["db"], attached: true });
    expect(JSON.stringify(result)).not.toContain("not-returned");
  });

  it("includes inactive configured and dynamically allocated bindings without treating them as published", async () => {
    const { docker, asDocker } = fakeDocker({ listContainers: vi.fn().mockResolvedValue([rawContainer({ Id: "stopped", State: "exited" })]) });
    docker.getContainer("stopped")!.inspect.mockResolvedValue({ HostConfig: { PortBindings: { "80/tcp": [{ HostIp: "127.0.0.1", HostPort: "8080" }, { HostIp: "", HostPort: "" }] } } });
    expect((await readNetworking(asDocker)).ports).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "configured", hostPort: 8080 }), expect.objectContaining({ kind: "configured", hostPort: null }),
    ]));
  });

  it("resolves namespace chains and leaves missing or cyclic owners unknown", async () => {
    const cs = [rawContainer({ Id: "owner", NetworkSettings: { Networks: { workspace: endpoint } } as any }),
      rawContainer({ Id: "child", HostConfig: { NetworkMode: "container:owner" } }),
      rawContainer({ Id: "nested", HostConfig: { NetworkMode: "container:child" } }),
      rawContainer({ Id: "missing", HostConfig: { NetworkMode: "container:absent" } }),
      rawContainer({ Id: "cycle1", HostConfig: { NetworkMode: "container:cycle2" } }),
      rawContainer({ Id: "cycle2", HostConfig: { NetworkMode: "container:cycle1" } })];
    const { asDocker } = fakeDocker({ listContainers: vi.fn().mockResolvedValue(cs), listNetworks: vi.fn().mockResolvedValue([network]) });
    const result = await readNetworking(asDocker);
    expect(result.containers.find(c => c.id === "nested")).toMatchObject({ namespaceId: "owner", networks: [expect.objectContaining({ networkId: "net1" })] });
    for (const id of ["missing", "cycle1", "cycle2"]) expect(result.containers.find(c => c.id === id)?.namespaceId).toBeNull();
    expect(result.networks[0].containerIds).toHaveLength(3);
  });

  it("keeps the snapshot usable when a stopped container disappears", async () => {
    const { asDocker, docker } = fakeDocker({ listContainers: vi.fn().mockResolvedValue([rawContainer({ Id: "gone", State: "exited" })]) });
    docker.getContainer("gone")!.inspect.mockRejectedValue(new Error("gone"));
    expect((await readNetworking(asDocker)).warnings).toHaveLength(1);
  });

  it("serves a cached read-only endpoint and recovers from failed reads", async () => {
    const { asDocker, docker } = fakeDocker();
    docker.listNetworks.mockRejectedValueOnce(new Error("engine unavailable"));
    const app = await appWith(asDocker);
    try {
      expect((await app.inject({ method: "GET", url: "/api/networking" })).statusCode).toBe(500);
      expect((await app.inject({ method: "GET", url: "/api/networking" })).statusCode).toBe(200);
      expect((await app.inject({ method: "GET", url: "/api/networking" })).json().ports).toEqual([]);
      expect(docker.listNetworks).toHaveBeenCalledTimes(2);
      expect(docker.pruneNetworks).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
});
