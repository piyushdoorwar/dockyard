import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ComposeManifest, ComposeProject } from "../../shared/types";
import { ComposePage, composeCommand } from "../src/pages/ComposePage";
import { container, mockApi, renderPage } from "./helpers";

const project: ComposeProject = {
  directory: "apps/api", files: ["compose.yaml", "compose.dev.yaml"], selectedFiles: ["compose.yaml"], name: "sample-api",
  configuration: "resolved", services: [
    { name: "api", image: "nginx:alpine", build: false, ports: ["8080:80/tcp"], profiles: [] },
    { name: "worker", image: "busybox", build: false, ports: [], profiles: ["jobs"] },
  ], profiles: ["jobs"], issues: [], containers: [], status: "not-created", hostDirectory: "/repos/sample/apps/api",
};
const manifest: ComposeManifest = { root: "/workspace", projects: [project], warnings: [], scannedAt: "2026-10-02T12:00:00Z" };
const previewUrl = (override = "") => `GET /api/compose/preview?${new URLSearchParams({ file: "apps/api/compose.yaml", override })}`;

describe("Compose workspace UI", () => {
  it("lists projects without containers and filters by service or file name", async () => {
    mockApi({ "GET /api/compose": manifest });
    const user = userEvent.setup();
    renderPage(<ComposePage />);
    expect(await screen.findByText("sample-api")).toBeInTheDocument();
    expect(screen.getByText("No containers found")).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox"), "worker");
    expect(screen.getByText("sample-api")).toBeInTheDocument();
    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "absent");
    expect(screen.getByText("No matching Compose projects.")).toBeInTheDocument();
  });
  it("previews services, selects profiles, and copies a command without running it", async () => {
    const { mutations } = mockApi({ "GET /api/compose": manifest, [previewUrl()]: project });
    const user = userEvent.setup();
    const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    renderPage(<ComposePage />);
    await user.click(await screen.findByRole("button", { name: "View project apps/api" }));
    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByText("8080:80/tcp")).toBeInTheDocument();
    expect(within(dialog).getByText("nginx:alpine")).toBeInTheDocument();
    expect(within(dialog).getByText("1 of 2 services enabled by these profiles.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("checkbox", { name: "jobs" }));
    await user.click(within(dialog).getByRole("button", { name: "Copy command" }));
    expect(copy).toHaveBeenCalledWith("docker compose -f 'compose.yaml' --profile 'jobs' up -d");
    expect(mutations()).toEqual([]);
  });
  it("resolves an explicitly selected override and links matching containers", async () => {
    const resolved = { ...project, selectedFiles: ["compose.yaml", "compose.dev.yaml"], containers: [container({ id: "abc", name: "api-dev", project: "custom" })], status: "running" };
    mockApi({ "GET /api/compose": manifest, [previewUrl()]: project, [previewUrl("compose.dev.yaml")]: resolved });
    const user = userEvent.setup();
    renderPage(<ComposePage />);
    await user.click(await screen.findByRole("button", { name: "View project apps/api" }));
    await screen.findByText("8080:80/tcp");
    await user.selectOptions(screen.getByLabelText("Override file"), "compose.dev.yaml");
    expect(await screen.findByRole("link", { name: "api-dev" })).toHaveAttribute("href", "/containers/abc");
    expect(screen.getByText("docker compose -f 'compose.yaml' -f 'compose.dev.yaml' up -d")).toBeInTheDocument();
  });
  it("shows unresolved configuration and actionable empty-workspace guidance", async () => {
    mockApi({ "GET /api/compose": { ...manifest, projects: [{ ...project, configuration: "unresolved", issues: ["Missing required variable APP_TAG."] }] } });
    const view = renderPage(<ComposePage />);
    expect(await screen.findByText("Configuration unresolved")).toBeInTheDocument();
    expect(screen.getByText("Missing required variable APP_TAG.")).toBeInTheDocument();
    view.unmount();
    mockApi({ "GET /api/compose": { ...manifest, projects: [] } });
    renderPage(<ComposePage />);
    expect(await screen.findByText("No Compose files found.")).toBeInTheDocument();
    expect(screen.getByText(/Mount a repository at/)).toBeInTheDocument();
  });
  it("reports preview failures and allows a different selection", async () => {
    mockApi({ "GET /api/compose": manifest, [previewUrl()]: () => { throw { status: 503, error: "Previews busy" }; }, [previewUrl("compose.dev.yaml")]: project });
    const user = userEvent.setup();
    renderPage(<ComposePage />);
    await user.click(await screen.findByRole("button", { name: "View project apps/api" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Previews busy");
    await user.selectOptions(screen.getByLabelText("Override file"), "compose.dev.yaml");
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(await screen.findByText("8080:80/tcp")).toBeInTheDocument();
  });
  it("quotes command arguments as literal shell values", () => {
    expect(composeCommand({ ...project, selectedFiles: ["compose.dev.yaml"] }, ["it's-$(touch nope)"])).toBe("docker compose -f 'compose.dev.yaml' --profile 'it'\\''s-$(touch nope)' up -d");
  });
});
