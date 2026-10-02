import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { contentSecurityPolicy, isLoopbackHost, isSameOrigin } from "../src/security.js";
import { appWith, fakeDocker, MUTATE } from "./helpers.js";

describe("isLoopbackHost", () => {
  it.each(["localhost:41739", "127.0.0.1:41739", "[::1]:41739", "localhost"])("accepts %s", (h) => {
    expect(isLoopbackHost(h)).toBe(true);
  });
  it.each(["evil.com", "localhost.evil.com:41739", "192.168.1.5:41739", "", undefined])("rejects %s", (h) => {
    expect(isLoopbackHost(h)).toBe(false);
  });
});

describe("isSameOrigin", () => {
  it("allows requests without an Origin (curl, health checks)", () => {
    expect(isSameOrigin(undefined, "localhost:41739")).toBe(true);
  });
  it("allows the app's own origin", () => {
    expect(isSameOrigin("http://localhost:41739", "localhost:41739")).toBe(true);
  });
  it.each(["http://evil.com", "http://localhost:3000", "null", "not a url"])("rejects %s", (o) => {
    expect(isSameOrigin(o, "localhost:41739")).toBe(false);
  });
  it("normalises the Host header the way browsers normalise Origin", () => {
    // Served on port 80, the browser drops the port from Origin but not from Host.
    expect(isSameOrigin("http://localhost", "localhost:80")).toBe(true);
    expect(isSameOrigin("http://localhost:41739", "LOCALHOST:41739")).toBe(true);
  });
});

describe("contentSecurityPolicy", () => {
  it("allows WebSockets to this exact host and port only", () => {
    const csp = contentSecurityPolicy("127.0.0.1:41739");
    expect(csp).toContain("connect-src 'self' ws://127.0.0.1:41739 wss://127.0.0.1:41739;");
    expect(csp).not.toContain(":*");
  });
  it("doesn't echo a foreign Host into the header", () => {
    expect(contentSecurityPolicy("evil.example")).toContain("connect-src 'self';");
  });
});

describe("request guard", () => {
  let app: FastifyInstance;
  afterEach(() => app?.close());

  it("serves loopback requests", async () => {
    app = await appWith(fakeDocker().asDocker);
    const res = await app.inject({ url: "/api/health", headers: { host: "localhost:41739" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, version: "test" });
  });

  it("rejects a non-loopback Host (DNS rebinding)", async () => {
    app = await appWith(fakeDocker().asDocker);
    const res = await app.inject({ url: "/api/containers", headers: { host: "attacker.example:41739" } });
    expect(res.statusCode).toBe(403);
  });

  it("rejects a foreign Origin", async () => {
    app = await appWith(fakeDocker().asDocker);
    const res = await app.inject({
      url: "/api/containers",
      headers: { host: "localhost:41739", origin: "https://attacker.example" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects state-changing requests without the CSRF header", async () => {
    const { asDocker, docker } = fakeDocker();
    app = await appWith(asDocker);
    const res = await app.inject({ method: "POST", url: "/api/system/prune" });
    expect(res.statusCode).toBe(403);
    expect(docker.pruneContainers).not.toHaveBeenCalled();
  });

  it("allows state-changing requests that carry the CSRF header", async () => {
    app = await appWith(fakeDocker().asDocker);
    const res = await app.inject({ method: "POST", url: "/api/system/prune", headers: MUTATE });
    expect(res.statusCode).toBe(200);
  });

  it("sets hardening headers", async () => {
    app = await appWith(fakeDocker().asDocker);
    const res = await app.inject({ url: "/api/health" });
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(res.headers["cross-origin-resource-policy"]).toBe("same-origin");
  });

  it("rejects WebSocket upgrades from a foreign Origin", async () => {
    app = await appWith(fakeDocker().asDocker);
    await expect(
      app.injectWS("/api/containers/abc/exec", { headers: { host: "localhost:41739", origin: "https://attacker.example" } }),
    ).rejects.toThrow(/403/);
  });
});
