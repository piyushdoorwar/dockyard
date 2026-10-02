import type { FastifyInstance } from "fastify";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import type { LiveMessage } from "../../shared/types.js";
import { SHELL_CMD } from "../src/routes/live.js";
import { appWith, dockerError, fakeContainer, fakeDocker } from "./helpers.js";

const WS_HEADERS = { headers: { host: "localhost:41739", origin: "http://localhost:41739" } };
let app: FastifyInstance;
afterEach(() => app?.close());

function frame(type: 1 | 2, text: string): Buffer {
  const payload = Buffer.from(text);
  const header = Buffer.alloc(8);
  header[0] = type;
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

/** Collect JSON messages until `until` matches (or the socket closes). */
function collect(ws: WebSocket, until: (m: LiveMessage) => boolean): Promise<LiveMessage[]> {
  return new Promise((resolve) => {
    const got: LiveMessage[] = [];
    ws.on("message", (raw: Buffer) => {
      const msg = JSON.parse(raw.toString()) as LiveMessage;
      got.push(msg);
      if (until(msg)) resolve(got);
    });
    ws.on("close", () => resolve(got));
  });
}

/** For handlers that answer immediately: listen before the socket even opens. */
async function connectAndCollect(path: string, until: (m: LiveMessage) => boolean): Promise<LiveMessage[]> {
  let result!: Promise<LiveMessage[]>;
  await app.injectWS(path, WS_HEADERS, { onInit: (ws) => (result = collect(ws, until)) });
  return result;
}

describe("logs WebSocket", () => {
  it("streams demuxed, timestamp-split lines then 'end'", async () => {
    const { asDocker, containers } = fakeDocker();
    const c = fakeContainer({}, false);
    const stream = new PassThrough();
    c.logs.mockResolvedValue(stream);
    containers.set("web", c);
    app = await appWith(asDocker);

    const ws = await app.injectWS("/api/containers/web/logs?tail=50", WS_HEADERS);
    const done = collect(ws, (m) => m.type === "end");
    await vi.waitFor(() => expect(c.logs).toHaveBeenCalled());
    stream.write(frame(1, "2026-10-01T10:00:00Z hello\n2026-10-01T10:00:01Z wor"));
    stream.write(frame(1, "ld\n"));
    stream.write(frame(2, "2026-10-01T10:00:02Z oops\n"));
    stream.end();

    const messages = await done;
    const lines = messages.flatMap((m) => (m.type === "logs" ? m.lines : []));
    expect(lines).toEqual([
      { stream: "stdout", ts: "2026-10-01T10:00:00Z", text: "hello" },
      { stream: "stdout", ts: "2026-10-01T10:00:01Z", text: "world" },
      { stream: "stderr", ts: "2026-10-01T10:00:02Z", text: "oops" },
    ]);
    expect(c.logs).toHaveBeenCalledWith(expect.objectContaining({ follow: true, tail: 50, timestamps: true }));
    expect(messages.at(-1)).toEqual({ type: "end" });
  });

  it("passes TTY output through without demuxing", async () => {
    const { asDocker, containers } = fakeDocker();
    const c = fakeContainer({}, true);
    const stream = new PassThrough();
    c.logs.mockResolvedValue(stream);
    containers.set("tty", c);
    app = await appWith(asDocker);

    const ws = await app.injectWS("/api/containers/tty/logs", WS_HEADERS);
    const done = collect(ws, (m) => m.type === "end");
    await vi.waitFor(() => expect(c.logs).toHaveBeenCalled());
    stream.end("raw tty line\n");
    const lines = (await done).flatMap((m) => (m.type === "logs" ? m.lines : []));
    expect(lines).toEqual([{ stream: "stdout", ts: null, text: "raw tty line" }]);
  });

  it("sends an error message when the container doesn't exist", async () => {
    const { asDocker, containers } = fakeDocker();
    const c = fakeContainer();
    c.inspect.mockRejectedValue(dockerError(404, "No such container: ghost"));
    containers.set("ghost", c);
    app = await appWith(asDocker);
    const messages = await connectAndCollect("/api/containers/ghost/logs", (m) => m.type === "error");
    expect(messages).toEqual([{ type: "error", message: "No such container: ghost" }]);
  });
});

describe("stats WebSocket", () => {
  it("turns raw samples into computed stats", async () => {
    const { asDocker, containers } = fakeDocker();
    const c = fakeContainer();
    const stream = new PassThrough();
    c.stats.mockResolvedValue(stream);
    containers.set("web", c);
    app = await appWith(asDocker);

    const ws = await app.injectWS("/api/containers/web/stats", WS_HEADERS);
    const done = collect(ws, (m) => m.type === "stats");
    await vi.waitFor(() => expect(c.stats).toHaveBeenCalledWith({ stream: true }));
    stream.write(JSON.stringify({ memory_stats: { usage: 500, limit: 1000 }, pids_stats: { current: 2 } }) + "\n");
    const [msg] = await done;
    expect(msg).toMatchObject({ type: "stats", sample: { memUsage: 500, memPercent: 50, pids: 2 } });
    ws.terminate();
  });
});

describe("exec WebSocket", () => {
  it("bridges terminal input/output and resizes the TTY", async () => {
    const { asDocker, containers } = fakeDocker();
    const c = fakeContainer();
    const shell = new PassThrough();
    const written: string[] = [];
    shell.write = ((chunk: string) => (written.push(String(chunk)), true)) as typeof shell.write;
    const resize = vi.fn().mockResolvedValue(undefined);
    c.exec.mockResolvedValue({ start: vi.fn().mockResolvedValue(shell), resize });
    containers.set("web", c);
    app = await appWith(asDocker);

    const ws = await app.injectWS("/api/containers/web/exec", WS_HEADERS);
    const output = new Promise<string>((resolve) => ws.on("message", (d: Buffer) => resolve(d.toString())));
    ws.send(JSON.stringify({ type: "input", data: "ls\r" }));
    ws.send(JSON.stringify({ type: "resize", cols: 120, rows: 40 }));

    await vi.waitFor(() => expect(written).toEqual(["ls\r"]));
    expect(resize).toHaveBeenCalledWith({ w: 120, h: 40 });
    expect(c.exec).toHaveBeenCalledWith(expect.objectContaining({ Cmd: SHELL_CMD, Tty: true, AttachStdin: true }));

    shell.emit("data", Buffer.from("file.txt\r\n"));
    expect(await output).toBe("file.txt\r\n");
    ws.terminate();
  });

  it("reports when the container isn't running", async () => {
    const { asDocker, containers } = fakeDocker();
    const c = fakeContainer();
    c.exec.mockRejectedValue(dockerError(409, "Container web is not running"));
    containers.set("web", c);
    app = await appWith(asDocker);
    const messages = await connectAndCollect("/api/containers/web/exec", (m) => m.type === "error");
    expect(messages).toEqual([{ type: "error", message: "Container web is not running" }]);
  });
});
