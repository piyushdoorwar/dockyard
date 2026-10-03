import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { AgentsPage } from "../src/pages/AgentsPage";
import { mockApi, renderPage } from "./helpers";

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

function settingsApp(route = "/settings") {
  return render(<MemoryRouter initialEntries={[route]}><App /></MemoryRouter>);
}

describe("discovery preferences", () => {
  it.each(["/agents", "/compose"])("guards disabled direct links to %s without scanning", async (route) => {
    const { calls } = mockApi({});
    settingsApp(route);
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    const nav = within(screen.getByRole("navigation", { name: "Main" }));
    expect(nav.queryByRole("link", { name: "Agents" })).not.toBeInTheDocument();
    expect(nav.queryByRole("link", { name: "Compose" })).not.toBeInTheDocument();
    expect(nav.getByRole("link", { name: "Stacks" })).toBeInTheDocument();
    expect(calls.some((call) => /\/api\/(agents|compose)/.test(call.url))).toBe(false);
    expect(screen.getByRole("button", { name: /Switch to .* mode/ })).toBeInTheDocument();
  });

  it("saves independent preferences and restores them after remounting", async () => {
    mockApi({});
    const user = userEvent.setup();
    const view = settingsApp();
    await user.click(screen.getByRole("checkbox", { name: "Agent instructions" }));
    expect(screen.getByRole("link", { name: "Agents" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Compose" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Compose stack discovery" }));
    view.unmount();
    settingsApp();
    expect(screen.getByRole("checkbox", { name: "Agent instructions" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Compose stack discovery" })).toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "Agent instructions" }));
    expect(screen.queryByRole("link", { name: "Agents" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Compose" })).toBeInTheDocument();
  });

  it("allows an enabled discovery page to scan", async () => {
    localStorage.setItem("dockyard.discovery", JSON.stringify({ agents: true }));
    const { calls } = mockApi({ "GET /api/agents": { root: "/workspace", files: [] } });
    settingsApp("/agents");
    expect(await screen.findByText("No AGENTS.md files found")).toBeInTheDocument();
    expect(calls.some((call) => call.url === "/api/agents")).toBe(true);
  });

  it("works for the session when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    mockApi({});
    settingsApp();
    await userEvent.click(screen.getByRole("checkbox", { name: "Agent instructions" }));
    expect(screen.getByRole("link", { name: "Agents" })).toBeInTheDocument();
  });
});

it("collapses agent files by default and expands them independently", async () => {
  const files = ["AGENTS.md", "web/AGENTS.md"].map((path, index) => ({
    path, relativePath: path, content: `Instructions ${index}`, truncated: false,
    sections: [{ title: `Section ${index}`, level: 1, body: `Instructions ${index}` }],
  }));
  mockApi({ "GET /api/agents": { root: "/workspace", files } });
  renderPage(<AgentsPage />);
  const first = await screen.findByRole("button", { name: "AGENTS.md" });
  const second = screen.getByRole("button", { name: "web/AGENTS.md" });
  expect(first).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("Instructions 0")).not.toBeInTheDocument();
  await userEvent.click(first);
  expect(screen.getByText("Instructions 0")).toBeVisible();
  expect(second).toHaveAttribute("aria-expanded", "false");
  await userEvent.click(screen.getByRole("button", { name: "Rescan" }));
  await waitFor(() => expect(first).toHaveAttribute("aria-expanded", "true"));
  first.focus();
  await userEvent.keyboard("{Enter}");
  expect(first).toHaveAttribute("aria-expanded", "false");
});
