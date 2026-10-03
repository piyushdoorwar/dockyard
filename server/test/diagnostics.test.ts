import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { appWith, fakeContainer, fakeDocker } from "./helpers.js";

let app: FastifyInstance;
afterEach(() => app?.close());

function frame(stream: 1 | 2, value: string): Buffer {
  const payload = Buffer.from(value);
  const header = Buffer.alloc(8);
  header[0] = stream;
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

const inspect = {
  Id: "failed",
  Config: { Tty: false, Env: ["PASSWORD=secret"] },
  State: {
    Status: "exited", Running: false, ExitCode: 137, OOMKilled: true,
    Error: "", StartedAt: "2026-10-03T01:00:00Z", FinishedAt: "2026-10-03T01:01:00Z",
    Health: { Status: "unhealthy", FailingStreak: 2, Log: [{ Start: "2026-10-03T01:00:00Z", End: "2026-10-03T01:00:01Z", ExitCode: 1, Output: "connection refused" }] },
  },
  RestartCount: 3,
};

describe("container diagnostics", () => {
  it("combines bounded state, health and demultiplexed recent logs without inspect secrets", async () => {
    const c = fakeContainer();
    c.inspect.mockResolvedValue(inspect);
    c.logs.mockResolvedValue(Buffer.concat([
      frame(1, "2026-10-03T01:00:00Z booted\n"),
      frame(2, "2026-10-03T01:00:01Z failed to connect\n"),
    ]));
    const { asDocker, containers } = fakeDocker();
    containers.set("failed", c);
    app = await appWith(asDocker);
    const res = await app.inject({ url: "/api/containers/failed/diagnostics" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "exited", exitCode: 137, oomKilled: true, restartCount: 3,
      health: { status: "unhealthy", failingStreak: 2, checks: [{ exitCode: 1, output: "connection refused" }] },
      logs: [{ stream: "stdout", text: "booted" }, { stream: "stderr", text: "failed to connect" }] });
    expect(res.body).not.toContain("PASSWORD");
    expect(c.logs).toHaveBeenCalledWith({ follow: false, stdout: true, stderr: true, timestamps: true, tail: 80 });
  });

  it("handles raw TTY logs and an unsupported log driver", async () => {
    const c = fakeContainer();
    c.inspect.mockResolvedValue({ ...inspect, Config: { Tty: true }, State: { ...inspect.State, Health: undefined } });
    c.logs.mockResolvedValueOnce(Buffer.from("2026-10-03T01:00:00Z plain line\n"));
    const { asDocker, containers } = fakeDocker();
    containers.set("failed", c);
    app = await appWith(asDocker);
    expect((await app.inject({ url: "/api/containers/failed/diagnostics" })).json()).toMatchObject({
      health: null, logs: [{ stream: "stdout", text: "plain line" }],
    });
    c.logs.mockRejectedValue(new Error("driver does not support reading"));
    const result = (await app.inject({ url: "/api/containers/failed/diagnostics" })).json();
    expect(result.logs).toEqual([]);
    expect(result.logError).toContain("unavailable");
  });

  it("bounds large log lines and health output", async () => {
    const c = fakeContainer();
    c.inspect.mockResolvedValue({ ...inspect, State: { ...inspect.State, Health: { ...inspect.State.Health, Log: [{ ...inspect.State.Health.Log[0], Output: "h".repeat(5000) }] } } });
    c.logs.mockResolvedValue(frame(1, `2026-10-03T01:00:00Z ${"x".repeat(5000)}\n`));
    const { asDocker, containers } = fakeDocker();
    containers.set("failed", c);
    app = await appWith(asDocker);
    const result = (await app.inject({ url: "/api/containers/failed/diagnostics" })).json();
    expect(result.health.checks[0].output).toHaveLength(2000);
    expect(result.logs[0].text).toHaveLength(1000);
  });

  it("rejects malformed IDs before calling Docker", async () => {
    const { asDocker, docker } = fakeDocker();
    app = await appWith(asDocker);
    expect((await app.inject({ url: "/api/containers/..%2Fetc/diagnostics" })).statusCode).toBe(400);
    expect(docker.getContainer).not.toHaveBeenCalled();
  });
});
