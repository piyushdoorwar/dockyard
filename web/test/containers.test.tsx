import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ContainersPage } from "../src/pages/ContainersPage";
import { container, mockApi, renderPage } from "./helpers";

const LIST = [
  container({ id: "aaa111", name: "sample-api", project: "sample", service: "api", ports: [{ privatePort: 80, publicPort: 8080, type: "tcp" }] }),
  container({ id: "bbb222", name: "sample-db", state: "exited", status: "Exited (1) 5 minutes ago" }),
  container({ id: "ccc333", name: "dockyard", isSelf: true }),
];

describe("ContainersPage", () => {
  it("lists containers with status, ports and stack", async () => {
    mockApi({ "GET /api/containers": LIST });
    renderPage(<ContainersPage />);
    expect(await screen.findByRole("link", { name: "sample-api" })).toHaveAttribute("href", "/containers/aaa111");
    expect(screen.getByText("Exited (1)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /8080:80/ })).toHaveAttribute("href", "http://localhost:8080");
    expect(screen.getByText("2 running of 3")).toBeInTheDocument();
    expect(screen.getByText("this app")).toBeInTheDocument();
  });

  it("filters by search text and running-only", async () => {
    mockApi({ "GET /api/containers": LIST });
    const user = userEvent.setup();
    renderPage(<ContainersPage />);
    await screen.findByText("sample-db");

    await user.type(screen.getByRole("searchbox", { name: "Search containers" }), "db");
    expect(screen.queryByText("sample-api")).not.toBeInTheDocument();
    expect(screen.getByText("sample-db")).toBeInTheDocument();

    await user.clear(screen.getByRole("searchbox"));
    await user.click(screen.getByLabelText("Only show running"));
    expect(screen.queryByText("sample-db")).not.toBeInTheDocument();
    expect(screen.getByText("sample-api")).toBeInTheDocument();
  });

  it("stops a running container and starts a stopped one", async () => {
    const { mutations } = mockApi({
      "GET /api/containers": LIST,
      "POST /api/containers/aaa111/stop": { ok: true },
      "POST /api/containers/bbb222/start": { ok: true },
    });
    const user = userEvent.setup();
    renderPage(<ContainersPage />);
    await user.click(await screen.findByRole("button", { name: "Stop sample-api" }));
    await waitFor(() => expect(mutations().map((c) => c.url)).toEqual(["/api/containers/aaa111/stop"]));
    expect(mutations()[0].headers["x-dockyard"]).toBe("1");
    expect(await screen.findByText("sample-api stopped")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start sample-db" }));
    await waitFor(() => expect(mutations()).toHaveLength(2));
  });

  it("asks before deleting, and does nothing on cancel", async () => {
    const { mutations } = mockApi({ "GET /api/containers": LIST, "DELETE /api/containers/bbb222?force=true": { ok: true } });
    const user = userEvent.setup();
    renderPage(<ContainersPage />);

    await user.click(await screen.findByRole("button", { name: "Delete sample-db" }));
    const dialog = screen.getByRole("dialog", { name: "Delete container?" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(mutations()).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Delete sample-db" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mutations().map((c) => `${c.method} ${c.url}`)).toEqual(["DELETE /api/containers/bbb222?force=true"]));
  });

  it("shows Stop (in red) for a container stuck restarting, and names unhealthy ones", async () => {
    mockApi({
      "GET /api/containers": [
        container({ id: "r1", name: "flaky", state: "restarting", status: "Restarting (1) 3 seconds ago" }),
        container({ id: "u1", name: "sick", status: "Up 2 hours (unhealthy)" }),
      ],
    });
    renderPage(<ContainersPage />);
    const stop = await screen.findByRole("button", { name: "Stop flaky" });
    expect(stop).toHaveClass("text-danger");
    expect(screen.queryByRole("button", { name: "Start flaky" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete flaky" })).toHaveClass("text-danger");
    expect(screen.getByText("Unhealthy")).toBeInTheDocument();
  });

  it("won't let Dockyard stop or delete itself", async () => {
    mockApi({ "GET /api/containers": LIST });
    renderPage(<ContainersPage />);
    expect(await screen.findByRole("button", { name: "Stop dockyard" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete dockyard" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Restart dockyard" })).toBeDisabled();
  });

  it("shows the server's error when an action fails", async () => {
    mockApi({
      "GET /api/containers": LIST,
      "POST /api/containers/aaa111/restart": () => {
        throw { status: 500, error: "driver failed programming external connectivity" };
      },
    });
    const user = userEvent.setup();
    renderPage(<ContainersPage />);
    await user.click(await screen.findByRole("button", { name: "Restart sample-api" }));
    expect(await screen.findByText("driver failed programming external connectivity")).toBeInTheDocument();
  });

  it("shows an error banner when Docker is unreachable", async () => {
    mockApi({
      "GET /api/containers": () => {
        throw { status: 500, error: "connect ENOENT /var/run/docker.sock" };
      },
    });
    renderPage(<ContainersPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("connect ENOENT /var/run/docker.sock");
  });
});
