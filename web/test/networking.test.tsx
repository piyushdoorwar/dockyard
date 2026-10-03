import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { NetworkContainer, NetworkingSnapshot, NetworkSummary } from "../../shared/types";
import { NetworkingPage } from "../src/pages/NetworkingPage";
import { bindAddress, compareNetworks } from "../src/lib/networking";
import { mockApi, renderPage } from "./helpers";

const net: NetworkSummary = { id: "net", name: "demo", driver: "bridge", scope: "local", internal: false, attachable: false, ipv6: false, defaultBridge: false, communicationDisabled: false, subnets: [], project: null, containerIds: ["a", "b"] };
const a: NetworkContainer = { id: "a", name: "api", state: "running", status: "Up", project: "demo", service: "api", networkMode: "demo", effectiveNetworkMode: "demo", namespaceId: "a", networks: [{ networkId: "net", name: "demo", attached: true, ipv4: "172.20.0.2", ipv6: null, aliases: ["api"] }] };
const b: NetworkContainer = { ...a, id: "b", name: "database", namespaceId: "b" };
const snapshot: NetworkingSnapshot = { containers: [a, b], networks: [net], warnings: [], scannedAt: "2026-10-03", ports: [
  { containerId: "a", hostIp: "::1", hostPort: 8080, containerPort: 80, protocol: "tcp", kind: "published" },
  { containerId: "b", hostIp: "127.0.0.1", hostPort: 5432, containerPort: 5432, protocol: "tcp", kind: "configured" },
] };

describe("network comparison", () => {
  it("explains bridge DNS without claiming tested connectivity", () => {
    expect(compareNetworks(a, b, [net]).detail).toContain("support container names");
    expect(compareNetworks(a, b, [{ ...net, defaultBridge: true }]).detail).toContain("requires container IP");
    expect(compareNetworks(a, b, [net]).detail).toContain("not tested");
    expect(bindAddress("::1")).toBe("[::1]");
  });
  it.each([
    [{ state: "exited" }, "Both containers must be running"],
    [{ effectiveNetworkMode: "none" }, "Networking disabled"],
    [{ effectiveNetworkMode: "host", namespaceId: "host" }, "Host networking"],
    [{ namespaceId: "a" }, "Shared network namespace"],
    [{ namespaceId: null }, "Network namespace unknown"],
    [{ networks: [] }, "No shared Docker network"],
  ])("handles %j", (change, title) => expect(compareNetworks(a, { ...b, ...change }, [net]).title).toBe(title));
  it("detects disabled peer communication and disregards stale attachments", () => {
    expect(compareNetworks(a, b, [{ ...net, communicationDisabled: true }]).title).toBe("Peer communication disabled");
    expect(compareNetworks(a, { ...b, networks: [{ ...b.networks[0], attached: false }] }, [net]).title).toBe("No shared Docker network");
  });
});

it("filters ports, reveals inactive mappings, expands members, and compares without mutations", async () => {
  const api = mockApi({ "GET /api/networking": snapshot });
  renderPage(<NetworkingPage />);
  expect(await screen.findByText("[::1]:8080")).toBeInTheDocument();
  expect(screen.queryByText("127.0.0.1:5432")).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Include inactive mappings"));
  expect(screen.getByText("127.0.0.1:5432")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "5432" } });
  expect(screen.queryByText("[::1]:8080")).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Clear search"));
  fireEvent.click(screen.getByRole("tab", { name: "Networks" }));
  fireEvent.click(screen.getByRole("button", { name: "Show containers on demo" }));
  expect(screen.getAllByText("172.20.0.2")).toHaveLength(2);
  fireEvent.change(screen.getByLabelText("First container"), { target: { value: "a" } });
  fireEvent.change(screen.getByLabelText("Second container"), { target: { value: "b" } });
  expect(screen.getByText("Shared network found")).toBeInTheDocument();
  expect(api.mutations()).toEqual([]);
});

it("shows API errors", async () => {
  mockApi({ "GET /api/networking": () => { throw { error: "Docker unavailable" }; } });
  renderPage(<NetworkingPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Docker unavailable");
});
