import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ImageSummary, StackSummary, VolumeSummary } from "../../shared/types";
import { SideNav } from "../src/components/SideNav";
import { DashboardPage } from "../src/pages/DashboardPage";
import { ImagesPage } from "../src/pages/ImagesPage";
import { StacksPage } from "../src/pages/StacksPage";
import { VolumesPage } from "../src/pages/VolumesPage";
import { container, mockApi, renderPage } from "./helpers";

const STACKS: StackSummary[] = [
  {
    name: "sample-backend",
    workingDir: "/home/repos/demo/sample-api",
    status: "partial",
    running: 2,
    total: 3,
    containers: [container({ id: "a1", name: "api", project: "sample-backend", service: "api" })],
  },
  { name: "storage", workingDir: null, status: "stopped", running: 0, total: 1, containers: [] },
];

describe("StacksPage", () => {
  it("shows each stack's state", async () => {
    mockApi({ "GET /api/stacks": STACKS });
    renderPage(<StacksPage />);
    expect(await screen.findByText("sample-backend")).toBeInTheDocument();
    expect(screen.getByText("Running (2/3)")).toBeInTheDocument();
    expect(screen.getByText("Stopped")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start storage" })).toBeInTheDocument();
  });

  it("stops a stack and reports containers that failed", async () => {
    const { mutations } = mockApi({
      "GET /api/stacks": STACKS,
      "POST /api/stacks/sample-backend/stop": {
        results: [
          { id: "a1", name: "api", ok: true },
          { id: "a2", name: "worker", ok: false, error: "timeout" },
        ],
      },
    });
    const user = userEvent.setup();
    renderPage(<StacksPage />);
    await user.click(await screen.findByRole("button", { name: "Stop sample-backend" }));
    await waitFor(() => expect(mutations()).toHaveLength(1));
    expect(await screen.findByText("1 of 2 container(s) failed")).toBeInTheDocument();
    expect(screen.getByText("worker: timeout")).toBeInTheDocument();
  });

  it("confirms before deleting a stack", async () => {
    const { mutations } = mockApi({ "GET /api/stacks": STACKS, "DELETE /api/stacks/storage": { results: [] } });
    const user = userEvent.setup();
    renderPage(<StacksPage />);
    await user.click(await screen.findByRole("button", { name: "Delete storage" }));
    await user.click(within(screen.getByRole("dialog", { name: "Delete stack?" })).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mutations().map((c) => c.url)).toEqual(["/api/stacks/storage"]));
  });
});

const IMAGES: ImageSummary[] = [
  { id: "sha256:1", shortId: "111111111111", repository: "redis", tag: "7", repoTags: ["redis:7"], size: 1.2e8, created: 1, containers: 2, dangling: false },
  { id: "sha256:2", shortId: "222222222222", repository: "<none>", tag: "<none>", repoTags: [], size: 5e7, created: 1, containers: 0, dangling: true },
];

describe("ImagesPage", () => {
  it("labels in-use and dangling images", async () => {
    mockApi({ "GET /api/images": IMAGES });
    renderPage(<ImagesPage />);
    expect(await screen.findByText("In use (2)")).toBeInTheDocument();
    expect(screen.getByText("Dangling")).toBeInTheDocument();
    expect(screen.getByText("2 images · 170 MB")).toBeInTheDocument();
  });

  it("pulls an image from the dialog", async () => {
    const { mutations } = mockApi({ "GET /api/images": IMAGES, "POST /api/images/pull": { ok: true, image: "postgres:17" } });
    const user = userEvent.setup();
    renderPage(<ImagesPage />);
    await user.click(await screen.findByRole("button", { name: "Pull image" }));
    const dialog = screen.getByRole("dialog", { name: "Pull image" });
    const pull = within(dialog).getByRole("button", { name: "Pull" });
    expect(pull).toBeDisabled();
    await user.type(within(dialog).getByRole("textbox"), "postgres:17");
    await user.click(pull);
    await waitFor(() => expect(mutations()[0]?.body).toEqual({ image: "postgres:17" }));
    expect(await screen.findByText("Pulled postgres:17")).toBeInTheDocument();
  });

  it("cleans up dangling only unless 'all unused' is ticked", async () => {
    const { mutations } = mockApi({ "GET /api/images": IMAGES, "POST /api/images/prune": { deleted: 1, reclaimed: 5e7 } });
    const user = userEvent.setup();
    renderPage(<ImagesPage />);
    await user.click(await screen.findByRole("button", { name: "Clean up" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(mutations()[0]?.body).toEqual({ all: false }));

    await user.click(screen.getByRole("button", { name: "Clean up" }));
    await user.click(screen.getByLabelText(/Also remove every image/));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(mutations()[1]?.body).toEqual({ all: true }));
  });
});

const VOLUMES: VolumeSummary[] = [
  { name: "sample_pgdata", driver: "local", mountpoint: "/x", created: null, size: 2e9, refCount: 1, project: "sample" },
  { name: "old_data", driver: "local", mountpoint: "/y", created: null, size: 1e6, refCount: 0, project: null },
];

describe("VolumesPage", () => {
  it("warns about data loss before deleting a volume", async () => {
    const { mutations } = mockApi({ "GET /api/volumes": VOLUMES, "DELETE /api/volumes/old_data": { ok: true } });
    const user = userEvent.setup();
    renderPage(<VolumesPage />);
    await user.click(await screen.findByRole("button", { name: "Delete old_data" }));
    const dialog = screen.getByRole("dialog", { name: "Delete volume?" });
    expect(dialog).toHaveTextContent("all data in it");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mutations().map((c) => c.url)).toEqual(["/api/volumes/old_data"]));
  });

  it("shows usage and size", async () => {
    mockApi({ "GET /api/volumes": VOLUMES });
    renderPage(<VolumesPage />);
    expect(await screen.findByText("2 GB")).toBeInTheDocument();
    expect(screen.getByText("In use")).toBeInTheDocument();
    expect(screen.getByText("Unused")).toBeInTheDocument();
  });
});

describe("DashboardPage", () => {
  const SYSTEM = {
    name: "dev-box", serverVersion: "29.6.1", os: "Ubuntu 24.04", kernelVersion: "6.8", architecture: "x86_64",
    cpus: 8, memTotal: 3.2e10, containers: { total: 11, running: 9, paused: 0, stopped: 2 }, images: 20, appVersion: "abc123",
  };
  const DF = {
    images: { count: 20, size: 1.08e10, reclaimable: 7.6e9 },
    containers: { count: 11, size: 9e6, reclaimable: 1e4 },
    volumes: { count: 10, size: 7.4e9, reclaimable: 2.4e8 },
    buildCache: { count: 95, size: 1.08e10, reclaimable: 1.08e10 },
    total: 2.91e10,
  };

  it("summarises the engine", async () => {
    mockApi({ "GET /api/system": SYSTEM, "GET /api/system/df": DF });
    renderPage(<DashboardPage />);
    expect(await screen.findByText("9 running · 2 stopped")).toBeInTheDocument();
    expect(await screen.findByText("29.1 GB")).toBeInTheDocument();
    expect(screen.getByText("abc123")).toBeInTheDocument();
  });

  it("cleans up after confirmation, keeping volumes", async () => {
    const { mutations } = mockApi({
      "GET /api/system": SYSTEM,
      "GET /api/system/df": DF,
      "POST /api/system/prune": { deleted: 4, reclaimed: 1.2e9 },
    });
    const user = userEvent.setup();
    renderPage(<DashboardPage />);
    await user.click(await screen.findByRole("button", { name: "Clean up" }));
    const dialog = screen.getByRole("dialog", { name: "Clean up Docker?" });
    expect(dialog).toHaveTextContent("Volumes (your databases) are kept");
    await user.click(within(dialog).getByRole("button", { name: "Clean up" }));
    await waitFor(() => expect(mutations().map((c) => c.url)).toEqual(["/api/system/prune"]));
    expect(await screen.findByText("Cleaned up 4 item(s), reclaimed 1.2 GB")).toBeInTheDocument();
  });
});

describe("SideNav", () => {
  it("highlights the current section", () => {
    renderPage(<SideNav />, "/images");
    expect(screen.getByRole("link", { name: "Images" })).toHaveClass("is-active");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveClass("is-active");
  });
});
