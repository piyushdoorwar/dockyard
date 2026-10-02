import { describe, expect, it } from "vitest";
import { api, ApiError, wsUrl } from "../src/lib/api";
import { exitCode, formatBytes, formatPercent, timeAgo } from "../src/lib/format";
import { containerTone } from "../src/components/StatusBadge";
import { mockApi } from "./helpers";

describe("api client", () => {
  it("sends GETs without the CSRF header", async () => {
    const { calls } = mockApi({ "GET /api/containers": [] });
    await api.containers();
    expect(calls[0].headers["x-dockyard"]).toBeUndefined();
  });

  it("marks mutations with the CSRF header and JSON body", async () => {
    const { calls } = mockApi({ "POST /api/images/pull": { ok: true, image: "redis:latest" } });
    await api.pullImage("redis");
    expect(calls[0]).toMatchObject({
      method: "POST",
      headers: { "x-dockyard": "1", "content-type": "application/json" },
      body: { image: "redis" },
    });
  });

  it("encodes ids in paths", async () => {
    const { calls } = mockApi({ "POST /api/stacks/a%2Fb/stop": { results: [] } });
    await api.stackAction("a/b", "stop");
    expect(calls[0].url).toBe("/api/stacks/a%2Fb/stop");
  });

  it("throws the server's error message", async () => {
    mockApi({
      "DELETE /api/volumes/pg": () => {
        throw { status: 409, error: "volume is in use" };
      },
    });
    const err = await api.removeVolume("pg").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, message: "volume is in use" });
  });

  it("builds same-origin WebSocket URLs", () => {
    expect(wsUrl("/api/containers/x/logs")).toBe(`ws://${window.location.host}/api/containers/x/logs`);
  });
});

describe("formatters", () => {
  it.each([
    [0, "0 B"],
    [999, "999 B"],
    [1500, "1.5 KB"],
    [142_000_000, "142 MB"],
    [10_800_000_000, "10.8 GB"],
    [null, "—"],
    [-1, "—"],
  ])("formatBytes(%s) = %s", (n, out) => {
    expect(formatBytes(n)).toBe(out);
  });

  it("timeAgo reads naturally", () => {
    const now = Date.parse("2026-10-01T12:00:00Z");
    expect(timeAgo(now / 1000 - 30, now)).toBe("just now");
    expect(timeAgo(now / 1000 - 3 * 3600, now)).toBe("3 hours ago");
    expect(timeAgo("2026-09-29T12:00:00Z", now)).toBe("2 days ago");
    expect(timeAgo(null, now)).toBe("—");
  });

  it("formats percentages and exit codes", () => {
    expect(formatPercent(27.444)).toBe("27.4%");
    expect(exitCode("Exited (137) 2 hours ago")).toBe(137);
    expect(exitCode("Up 3 hours")).toBeNull();
  });
});

describe("containerTone", () => {
  it.each([
    ["running", "Up 1 hour", "success"],
    ["running", "Up 1 hour (unhealthy)", "warning"],
    ["running", "Up 5 seconds (health: starting)", "warning"],
    ["restarting", "Restarting (1)", "warning"],
    ["exited", "Exited (0) 1 hour ago", "neutral"],
    ["exited", "Exited (1) 1 hour ago", "danger"],
    ["dead", "", "danger"],
  ])("%s / %s → %s", (state, status, tone) => {
    expect(containerTone(state, status)).toBe(tone);
  });
});
