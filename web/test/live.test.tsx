import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { LogsView } from "../src/components/container/LogsView";
import { StatsView } from "../src/components/container/StatsView";
import { portsFromInspect, statusText } from "../src/pages/ContainerDetailPage";
import type { ContainerInspect } from "../src/lib/api";
import { FakeWebSocket } from "./helpers";

beforeEach(() => FakeWebSocket.install());

describe("LogsView", () => {
  it("streams lines, colours stderr and filters", async () => {
    const user = userEvent.setup();
    render(<LogsView containerId="abc" />);
    const ws = FakeWebSocket.last();
    expect(ws.url).toMatch(/\/api\/containers\/abc\/logs\?tail=1000$/);

    act(() => {
      ws.open();
      ws.emit({
        type: "logs",
        lines: [
          { stream: "stdout", ts: "2026-10-01T10:00:00.000Z", text: "listening on 8080" },
          { stream: "stderr", ts: "2026-10-01T10:00:01.000Z", text: "connection refused" },
        ],
      });
    });
    expect(screen.getByTestId("log-state")).toHaveTextContent("Live");
    expect(screen.getByText("connection refused").closest("[data-stream]")).toHaveAttribute("data-stream", "stderr");

    await user.type(screen.getByRole("searchbox", { name: "Filter logs" }), "refused");
    expect(screen.queryByText("listening on 8080")).not.toBeInTheDocument();
    expect(screen.getByText("connection refused")).toBeInTheDocument();
  });

  it("offers to reconnect once the stream ends", async () => {
    const user = userEvent.setup();
    render(<LogsView containerId="abc" />);
    act(() => {
      FakeWebSocket.last().open();
      FakeWebSocket.last().emit({ type: "end" });
    });
    expect(screen.getByText("Log stream ended (container stopped).")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reconnect" }));
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("shows server errors", () => {
    render(<LogsView containerId="ghost" />);
    act(() => FakeWebSocket.last().emit({ type: "error", message: "No such container: ghost" }));
    expect(screen.getByTestId("log-state")).toHaveTextContent("No such container: ghost");
  });
});

describe("StatsView", () => {
  it("renders the latest sample", () => {
    render(<StatsView containerId="abc" />);
    act(() =>
      FakeWebSocket.last().emit({
        type: "stats",
        sample: { cpuPercent: 12.34, memUsage: 2e8, memLimit: 1e9, memPercent: 20, netRx: 1e6, netTx: 2e6, blockRead: 0, blockWrite: 0, pids: 4, timestamp: "" },
      }),
    );
    expect(screen.getByText("12.3%")).toBeInTheDocument();
    expect(screen.getByText("200 MB")).toBeInTheDocument();
    expect(screen.getByRole("meter", { name: "Memory used of limit" })).toHaveAttribute("aria-valuenow", "20");
  });
});

describe("portsFromInspect", () => {
  it("collapses IPv4/IPv6 bindings of the same host port", () => {
    const ports = portsFromInspect({
      NetworkSettings: {
        Ports: {
          "80/tcp": [
            { HostIp: "0.0.0.0", HostPort: "8080" },
            { HostIp: "::", HostPort: "8080" },
          ],
          "443/tcp": null,
        },
      },
    } as unknown as ContainerInspect);
    expect(ports).toEqual([{ privatePort: 80, publicPort: 8080, type: "tcp", ip: "0.0.0.0" }]);
  });
});

describe("statusText", () => {
  const state = (s: Partial<ContainerInspect["State"]>) => ({ State: { Status: "running", Running: true, ...s } }) as ContainerInspect;
  it("matches the list view's health and exit-code wording", () => {
    expect(statusText(state({ Health: { Status: "unhealthy" } }))).toBe("Up (unhealthy)");
    expect(statusText(state({ Health: { Status: "starting" } }))).toBe("Up (health: starting)");
    expect(statusText(state({}))).toBeUndefined();
    expect(statusText(state({ Status: "exited", Running: false, ExitCode: 0 }))).toBe("Exited (0)");
  });
});
