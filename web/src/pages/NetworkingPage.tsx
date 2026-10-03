import { Cable, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import type { HostPortBinding, NetworkContainer, NetworkingSnapshot, NetworkSummary } from "../../../shared/types";
import { Button } from "../components/Button";
import { DataTable, type Column } from "../components/DataTable";
import { Card, ErrorBanner, NoItemFound, PageHeader } from "../components/Page";
import { SearchBar, Toggle } from "../components/SearchBar";
import { Badge, ContainerStatus } from "../components/StatusBadge";
import { TabButton } from "../components/TabButton";
import { api } from "../lib/api";
import { bindAddress, compareNetworks } from "../lib/networking";
import { usePolling } from "../lib/usePolling";

function Owner({ container }: { container: NetworkContainer | undefined }) {
  return container ? <div><Link className="font-medium text-accent hover:underline" to={`/containers/${container.id}`}>{container.name}</Link><div className="mt-1"><ContainerStatus state={container.state} status={container.status} /></div></div> : <span>Container unavailable</span>;
}

function Compare({ data }: { data: NetworkingSnapshot }) {
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const a = data.containers.find(c => c.id === first);
  const b = data.containers.find(c => c.id === second);
  const result = a && b ? compareNetworks(a, b, data.networks) : null;
  return <Card title="Compare containers" className="mt-5">
    <p className="mb-4 text-13 text-muted">Check whether two containers share a network. This does not probe the services.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      {([{ id: "network-first", label: "First container", value: first, set: setFirst }, { id: "network-second", label: "Second container", value: second, set: setSecond }]).map(field => <div key={field.id}>
        <label className="label" htmlFor={field.id}>{field.label}</label>
        <select id={field.id} className="input" value={field.value} onChange={e => field.set(e.target.value)}><option value="">Choose a container</option>{data.containers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      </div>)}
    </div>
    <div aria-live="polite">{result && <div className="mt-4 rounded-lg bg-canvas p-4"><h3 className="text-sm font-medium text-ink">{result.title}</h3><p className="mt-1 text-13 text-grey">{result.detail}</p></div>}</div>
  </Card>;
}

function Members({ network, data }: { network: NetworkSummary; data: NetworkingSnapshot }) {
  const members = data.containers.filter(c => network.containerIds.includes(c.id));
  return <div className="p-4">
    <p className="mb-3 text-12 text-muted">{network.subnets.map(s => `${s.subnet}${s.gateway ? ` (gateway ${s.gateway})` : ""}`).join(", ") || "No IPAM subnet reported"}{network.communicationDisabled ? ". Peer communication disabled." : ""}</p>
    <DataTable rows={members} rowKey={c => c.id} empty={<NoItemFound message="No local containers listed on this network." />} columns={[
      { key: "name", header: "Container", minWidth: 180, render: c => <Owner container={c} /> },
      { key: "addresses", header: "Addresses", minWidth: 200, render: c => { const n = c.networks.find(n => n.networkId === network.id); return <code className="text-12">{[n?.ipv4, n?.ipv6].filter(Boolean).join(", ") || "No address assigned"}</code>; } },
      { key: "aliases", header: "DNS aliases", minWidth: 180, render: c => c.networks.find(n => n.networkId === network.id)?.aliases.join(", ") || "None reported" },
    ]} />
  </div>;
}

export function NetworkingPage() {
  const { data, error, loading, refresh } = usePolling(api.networking, 5_000);
  const [tab, setTab] = useState<"ports" | "networks">("ports");
  const [query, setQuery] = useState("");
  const [inactive, setInactive] = useState(false);
  const q = query.trim().toLowerCase();
  const owner = (p: HostPortBinding) => data?.containers.find(c => c.id === p.containerId);
  const ports = (data?.ports ?? []).filter(p => (inactive || p.kind === "published") && `${p.hostIp} ${p.hostPort ?? "dynamic"} ${p.containerPort} ${p.protocol} ${owner(p)?.name ?? ""} ${owner(p)?.project ?? ""}`.toLowerCase().includes(q));
  const networks = (data?.networks ?? []).filter(n => `${n.name} ${n.driver} ${n.project ?? ""} ${n.subnets.map(s => s.subnet).join(" ")} ${n.containerIds.map(id => data?.containers.find(c => c.id === id)?.name).join(" ")}`.toLowerCase().includes(q));
  const portColumns: Column<HostPortBinding>[] = [
    { key: "host", header: "Host binding", minWidth: 190, sortValue: p => p.hostPort ?? Infinity, render: p => <div><code className="text-13">{bindAddress(p.hostIp)}:{p.hostPort ?? "dynamic"}</code><div className="mt-1 text-12 text-muted">{p.hostIp === "0.0.0.0" || p.hostIp === "::" ? "All interfaces" : p.hostIp === "::1" || p.hostIp.startsWith("127.") ? "Loopback" : p.hostIp ? "Specific interface" : "Default bind address"}</div></div> },
    { key: "protocol", header: "Protocol", minWidth: 90, render: p => p.protocol.toUpperCase() },
    { key: "target", header: "Container port", minWidth: 120, sortValue: p => p.containerPort, render: p => <code>{p.containerPort}</code> },
    { key: "owner", header: "Owner", minWidth: 180, sortValue: p => owner(p)?.name ?? "", render: p => <Owner container={owner(p)} /> },
    { key: "stack", header: "Stack", minWidth: 130, render: p => owner(p)?.project ?? "None" },
    { key: "state", header: "Mapping", minWidth: 160, render: p => <Badge tone={p.kind === "published" ? "success" : "neutral"}>{p.kind === "published" ? "Published" : p.hostPort ? "Inactive configuration" : "Dynamic on start"}</Badge> },
  ];
  const networkColumns: Column<NetworkSummary>[] = [
    { key: "name", header: "Network", minWidth: 180, sortValue: n => n.name, render: n => <div><span className="font-medium text-ink">{n.name}</span><div className="mt-1 flex flex-wrap gap-1">{n.internal && <Badge tone="neutral">Internal</Badge>}{n.ipv6 && <Badge tone="neutral">IPv6</Badge>}{n.defaultBridge && <Badge tone="neutral">Default bridge</Badge>}</div></div> },
    { key: "driver", header: "Driver", minWidth: 90, render: n => n.driver },
    { key: "scope", header: "Scope", minWidth: 90, render: n => n.scope },
    { key: "subnets", header: "Subnets", minWidth: 180, render: n => <code className="text-12">{n.subnets.map(s => s.subnet).join(", ") || "None"}</code> },
    { key: "stack", header: "Stack", minWidth: 130, render: n => n.project ?? "None" },
    { key: "members", header: "Local containers", minWidth: 140, sortValue: n => n.containerIds.length, render: n => n.containerIds.length },
  ];
  return <>
    <PageHeader title="Ports & networks" subtitle="Find port owners and inspect container connections." icon={<Cable size={22} />} actions={<Button variant="cancel" icon={RefreshCw} onClick={refresh}>Refresh</Button>} />
    <ErrorBanner error={error} />
    {data?.warnings.map(w => <p key={w} role="status" className="mb-3 rounded-lg bg-warning-soft p-3 text-13 text-warning">{w}</p>)}
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><TabButton tabs={[{ id: "ports", label: "Ports" }, { id: "networks", label: "Networks" }]} active={tab} onChange={setTab} /><SearchBar value={query} onChange={setQuery} placeholder={tab === "ports" ? "Search ports or containers" : "Search networks or containers"} /></div>
    {tab === "ports" ? <>
      <div className="mb-4"><Toggle checked={inactive} onChange={setInactive} label="Include inactive mappings" /></div>
      <DataTable rows={ports} rowKey={p => JSON.stringify(p)} columns={portColumns} loading={loading && !data} empty={<NoItemFound message={q ? "No port mappings match." : "No published port mappings."} />} />
      <p className="mt-4 text-12 text-muted">Docker mappings only. Host-network listeners and non-Docker processes are not listed. Published ports do not confirm a responding service; inactive mappings do not reserve a host port.</p>
    </> : <>
      <DataTable rows={networks} rowKey={n => n.id} columns={networkColumns} loading={loading && !data} empty={<NoItemFound message="No networks match." />} expandLabel={n => `Show containers on ${n.name}`} expansion={n => data ? <Members network={n} data={data} /> : null} />
      {data && <Compare data={data} />}
    </>}
  </>;
}
