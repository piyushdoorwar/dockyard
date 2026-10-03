import type Docker from "dockerode";
import type { FastifyInstance } from "fastify";
import type { HostPortBinding, NetworkContainer, NetworkingSnapshot, NetworkSummary } from "../../../shared/types.js";
import { toContainerSummary } from "../mappers.js";

const liveStates = new Set(["running", "paused", "restarting"]);

function containerNetwork(c: Docker.ContainerInfo): NetworkContainer {
  const summary = toContainerSummary(c);
  const mode = c.HostConfig?.NetworkMode ?? "unknown";
  return {
    id: c.Id, name: summary.name, state: c.State, status: c.Status, project: summary.project, service: summary.service,
    networkMode: mode, effectiveNetworkMode: mode,
    namespaceId: mode === "host" ? "host" : mode.startsWith("container:") || mode === "unknown" ? null : c.Id,
    networks: Object.entries(c.NetworkSettings?.Networks ?? {}).map(([name, endpoint]) => ({
      networkId: endpoint.NetworkID || null, name,
      ipv4: endpoint.IPAddress || null, ipv6: endpoint.GlobalIPv6Address || null,
      aliases: Array.isArray(endpoint.Aliases) ? endpoint.Aliases.filter((a): a is string => typeof a === "string") : [],
      attached: !!endpoint.EndpointID,
    })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Resolve --network container:<id/name>, without inventing independent endpoints for the child. */
function resolveNamespaces(containers: NetworkContainer[]): void {
  const byId = new Map(containers.map((c) => [c.id, c]));
  const done = new Set<string>();
  function resolve(c: NetworkContainer, visiting = new Set<string>()): void {
    if (done.has(c.id) || !c.networkMode.startsWith("container:")) return;
    if (visiting.has(c.id) || visiting.size >= 32) return;
    visiting.add(c.id);
    const reference = c.networkMode.slice("container:".length).replace(/^\//, "");
    const candidates = containers.filter((other) => other.name === reference || other.id.startsWith(reference));
    const owner = byId.get(reference) ?? (candidates.length === 1 ? candidates[0] : undefined);
    if (owner && owner !== c && !visiting.has(owner.id)) {
      resolve(owner, visiting);
      c.namespaceId = owner.namespaceId;
      c.effectiveNetworkMode = owner.effectiveNetworkMode;
      c.networks = owner.networks;
    }
    done.add(c.id);
  }
  for (const c of containers) resolve(c);
}

export async function readNetworking(docker: Docker): Promise<NetworkingSnapshot> {
  const [rawContainers, rawNetworks] = await Promise.all([docker.listContainers({ all: true }), docker.listNetworks()]);
  const containers = rawContainers.map(containerNetwork).sort((a, b) => a.name.localeCompare(b.name));
  resolveNamespaces(containers);
  const warnings: string[] = [];
  const ports: HostPortBinding[] = [];
  for (const c of rawContainers) {
    if (!liveStates.has(c.State) || c.HostConfig?.NetworkMode === "host" || c.HostConfig?.NetworkMode?.startsWith("container:")) continue;
    for (const p of c.Ports ?? []) {
      // An EXPOSE declaration alone is not a host binding. Preserve IPv4/IPv6 and interface distinctions.
      if (!p.PublicPort) continue;
      ports.push({ containerId: c.Id, containerPort: p.PrivatePort, protocol: p.Type, hostIp: p.IP ?? "", hostPort: p.PublicPort, kind: "published" });
    }
  }
  // Docker's list omits stopped containers' saved port bindings. Inspect only those
  // containers, with bounded concurrency, and return no environment or other inspect data.
  const stopped = rawContainers.filter((c) => !liveStates.has(c.State) && c.HostConfig?.NetworkMode !== "host" && !c.HostConfig?.NetworkMode?.startsWith("container:"));
  for (let i = 0; i < stopped.length; i += 4) {
    await Promise.all(stopped.slice(i, i + 4).map(async (c) => {
      try {
        const info = await docker.getContainer(c.Id).inspect();
        for (const [key, bindings] of Object.entries(info.HostConfig?.PortBindings ?? {})) {
          const [port, protocol = "tcp"] = key.split("/");
          for (const binding of (Array.isArray(bindings) ? bindings : []) as { HostIp?: string; HostPort?: string }[]) {
            ports.push({ containerId: c.Id, containerPort: Number(port), protocol, hostIp: binding.HostIp ?? "",
              hostPort: binding.HostPort && Number(binding.HostPort) > 0 ? Number(binding.HostPort) : null, kind: "configured" });
          }
        }
      } catch {
        warnings.push(`Saved port mappings could not be read for ${toContainerSummary(c).name}. The container may have changed during this refresh.`);
      }
    }));
  }
  const networks: NetworkSummary[] = rawNetworks.map((n) => ({
    id: n.Id, name: n.Name, driver: n.Driver, scope: n.Scope, internal: !!n.Internal,
    attachable: !!n.Attachable, ipv6: !!n.EnableIPv6,
    defaultBridge: n.Options?.["com.docker.network.bridge.default_bridge"] === "true" || (n.Driver === "bridge" && n.Name === "bridge"),
    communicationDisabled: n.Driver === "bridge" && n.Options?.["com.docker.network.bridge.enable_icc"] === "false",
    subnets: (n.IPAM?.Config ?? []).filter((s) => !!s.Subnet).map((s) => ({ subnet: s.Subnet!, gateway: s.Gateway || null })),
    project: n.Labels?.["com.docker.compose.project"] ?? null,
    containerIds: containers.filter((c) => c.networks.some((a) => a.networkId === n.Id)).map((c) => c.id),
  })).sort((a, b) => a.name.localeCompare(b.name));
  // Different endpoints can report identical records; only exact duplicates may collapse.
  const unique = new Map(ports.map((p) => [JSON.stringify(p), p]));
  return {
    containers, networks, ports: [...unique.values()].sort((a, b) => (a.hostPort ?? Infinity) - (b.hostPort ?? Infinity)
      || a.hostIp.localeCompare(b.hostIp) || a.protocol.localeCompare(b.protocol) || a.containerId.localeCompare(b.containerId)),
    warnings: warnings.sort(), scannedAt: new Date().toISOString(),
  };
}

export function networkingRoutes(app: FastifyInstance, docker: Docker): void {
  // Share in-flight reads and a short cache across tabs, including stopped-container inspection.
  let cached: { at: number; promise: Promise<NetworkingSnapshot> } | undefined;
  app.get("/api/networking", async () => {
    if (!cached || Date.now() - cached.at > 2_000) {
      const entry = { at: Infinity, promise: readNetworking(docker) };
      cached = entry;
      entry.promise.then(() => { entry.at = Date.now(); }, () => { if (cached === entry) cached = undefined; });
    }
    return cached.promise;
  });
}
