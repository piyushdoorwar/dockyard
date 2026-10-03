import type { NetworkContainer, NetworkSummary } from "../../../shared/types";

export function bindAddress(ip: string): string {
  if (!ip) return "Docker default";
  return ip.includes(":") ? `[${ip}]` : ip;
}

export function compareNetworks(a: NetworkContainer, b: NetworkContainer, networks: NetworkSummary[]): { title: string; detail: string } {
  if (a.id === b.id) return { title: "Same container", detail: "Choose two different containers to compare their network configuration." };
  if (a.state !== "running" || b.state !== "running") return { title: "Both containers must be running", detail: "Stopped, paused, or restarting containers cannot be treated as available peers. Network membership may reflect saved configuration." };
  if (!a.namespaceId || !b.namespaceId) return { title: "Network namespace unknown", detail: "Docker did not provide enough information to resolve the shared network namespace." };
  if (a.namespaceId === b.namespaceId) return { title: "Shared network namespace", detail: "These containers share a network namespace, including its loopback interface. A service still needs to be listening on the expected port." };
  if ([a, b].some(c => c.effectiveNetworkMode === "none")) return { title: "Networking disabled", detail: "One of these containers uses the none network and has no external network interface." };
  if ([a, b].some(c => c.effectiveNetworkMode === "host")) return { title: "Host networking", detail: "One container uses the host network namespace. Check the service bind address and host routing; Docker network membership alone cannot establish connectivity." };
  const shared = a.networks.filter(n => n.networkId && n.attached && b.networks.some(other => other.networkId === n.networkId && other.attached));
  if (!shared.length) return { title: "No shared Docker network", detail: "No common active network attachment was found. Published host ports or other routing may still provide a connection." };
  const known = networks.filter(n => shared.some(s => s.networkId === n.id));
  const usable = known.filter(n => !n.communicationDisabled);
  if (known.length === shared.length && !usable.length) return { title: "Peer communication disabled", detail: "The shared bridge networks have inter-container communication disabled." };
  const dns = usable.filter(n => n.driver === "bridge" && !n.defaultBridge);
  return { title: "Shared network found", detail: `${shared.map(n => n.name).join(", ")}. ${dns.length ? "User-defined bridge networks support container names and aliases for DNS." : usable.some(n => n.defaultBridge) ? "The default bridge generally requires container IP addresses rather than automatic name resolution." : "Name resolution and routing depend on the network driver."} This is a configuration check; service listeners and firewall rules are not tested.` };
}
