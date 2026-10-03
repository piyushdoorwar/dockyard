import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Route, Routes } from "react-router";
import type { ContainerDiagnostics } from "../../shared/types";
import { DiagnosticsView, failureSignals } from "../src/components/container/DiagnosticsView";
import { ContainerDetailPage } from "../src/pages/ContainerDetailPage";
import { mockApi, renderPage } from "./helpers";

const diagnostics: ContainerDiagnostics = {
  id: "failed", status: "exited", exitCode: 137, oomKilled: true, restartCount: 4,
  engineError: null, startedAt: "2026-10-03T01:00:00Z", finishedAt: "2026-10-03T01:01:00Z",
  health: { status: "unhealthy", failingStreak: 2, checks: [{ startedAt: "2026-10-03T01:00:00Z", finishedAt: "2026-10-03T01:00:01Z", exitCode: 1, output: "connection refused" }] },
  logs: [{ stream: "stderr", ts: "2026-10-03T01:00:01Z", text: "database unavailable" }],
  logError: null, collectedAt: "2026-10-03T01:01:00Z",
};

describe("failure diagnostics", () => {
  it("reports evidence without guessing a cause", () => {
    expect(failureSignals(diagnostics)).toEqual([
      "Docker reports an out-of-memory kill.", "The process exited with code 137.",
    ]);
    expect(failureSignals({ ...diagnostics, status: "running", oomKilled: false, exitCode: 0 })).toEqual(["The health check is failing."]);
    expect(failureSignals({ ...diagnostics, oomKilled: false, exitCode: 0, health: null })).toEqual([]);
  });

  it("shows state, health output and recent logs from the read-only API", async () => {
    const api = mockApi({ "GET /api/containers/failed/diagnostics": diagnostics });
    renderPage(<DiagnosticsView containerId="failed" onShowLogs={() => {}} />);
    expect(await screen.findByText("The process exited with code 137.")).toBeInTheDocument();
    expect(screen.getByText("connection refused")).toBeInTheDocument();
    expect(screen.getByText("Last reported: unhealthy")).toBeInTheDocument();
    expect(screen.getByText("database unavailable")).toBeInTheDocument();
    expect(screen.getByText("Restart count")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(api.calls.filter(c => c.url.endsWith("/diagnostics"))).toHaveLength(2));
    expect(api.mutations()).toEqual([]);
  });

  it("opens through the container URL and can return to live logs", async () => {
    mockApi({
      "GET /api/containers/failed": { Id: "failed", Name: "/failed", Config: { Image: "alpine", Labels: {} }, State: { Status: "exited", Running: false, ExitCode: 137 }, NetworkSettings: { Ports: {} } },
      "GET /api/containers/failed/diagnostics": diagnostics,
    });
    renderPage(<Routes><Route path="/containers/:id" element={<ContainerDetailPage />} /></Routes>, "/containers/failed?tab=diagnostics");
    expect(await screen.findByText("database unavailable")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Diagnostics" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("button", { name: "Open live logs" }));
    expect(screen.getByRole("tab", { name: "Logs" })).toHaveAttribute("aria-selected", "true");
  });

  it("surfaces the diagnostics entry from a failed container row", async () => {
    const { ContainersPage } = await import("../src/pages/ContainersPage");
    mockApi({ "GET /api/containers": [{ id: "failed", shortId: "failed", name: "failed", image: "alpine", imageId: "image", state: "exited", status: "Exited (137)", created: 1, ports: [], project: null, projectDir: null, service: null, isSelf: false }] });
    renderPage(<ContainersPage />);
    expect(await screen.findByRole("link", { name: "View diagnostics" })).toHaveAttribute("href", "/containers/failed?tab=diagnostics");
  });

  it("shows a useful empty state when no failure or health check is reported", async () => {
    mockApi({ "GET /api/containers/failed/diagnostics": { ...diagnostics, status: "running", exitCode: 0, oomKilled: false, health: null, logs: [] } });
    renderPage(<DiagnosticsView containerId="failed" onShowLogs={() => {}} />);
    expect(await screen.findByText(/no clear failure signal/)).toBeInTheDocument();
    expect(screen.getByText("No health check is configured for this container.")).toBeInTheDocument();
    expect(screen.getByText("No recent log lines available.")).toBeInTheDocument();
  });
});
