import type Docker from "dockerode";
import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import type { ExecClientMessage, LiveMessage, LogLine } from "../../../shared/types.js";
import { toHttpError } from "../errors.js";
import { computeStats, type RawStats } from "../stats.js";
import { createDemuxer, LineSplitter, splitTimestamp, type StreamName } from "../streams.js";
import { idParams } from "./schemas.js";

/** Prefer bash, fall back to sh — many images (alpine, distroless-ish) only have sh. */
export const SHELL_CMD = ["/bin/sh", "-c", "if command -v bash >/dev/null 2>&1; then exec bash; else exec sh; fi"];

const LOG_FLUSH_MS = 100;
const LOG_BATCH_MAX = 500;

function send(socket: WebSocket, msg: LiveMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
}

function fail(socket: WebSocket, err: unknown): void {
  send(socket, { type: "error", message: toHttpError(err).message });
  socket.close();
}

type Destroyable = NodeJS.ReadableStream & { destroy?: () => void };

export function liveRoutes(app: FastifyInstance, docker: Docker): void {
  app.get<{ Params: { id: string }; Querystring: { tail: number } }>(
    "/api/containers/:id/logs",
    {
      websocket: true,
      schema: {
        params: idParams,
        querystring: { type: "object", properties: { tail: { type: "integer", minimum: 0, maximum: 10000, default: 500 } } },
      },
    },
    async (socket, req) => {
      let stream: Destroyable | undefined;
      let timer: NodeJS.Timeout | undefined;
      let tty = false;
      socket.on("close", () => {
        clearInterval(timer);
        stream?.destroy?.();
      });
      try {
        const container = docker.getContainer(req.params.id);
        // TTY containers send raw bytes; everything else is multiplexed frames.
        tty = Boolean((await container.inspect()).Config?.Tty);
        stream = (await container.logs({
          follow: true,
          stdout: true,
          stderr: true,
          timestamps: true,
          tail: req.query.tail,
        })) as unknown as Destroyable;
      } catch (err) {
        return fail(socket, err);
      }

      let pending: LogLine[] = [];
      const flush = () => {
        if (pending.length === 0) return;
        send(socket, { type: "logs", lines: pending });
        pending = [];
      };
      timer = setInterval(flush, LOG_FLUSH_MS);

      const splitters: Record<StreamName, LineSplitter> = { stdout: new LineSplitter(), stderr: new LineSplitter() };
      const addLines = (name: StreamName, lines: string[]) => {
        for (const line of lines) pending.push({ stream: name, ...splitTimestamp(line) });
        if (pending.length >= LOG_BATCH_MAX) flush();
      };
      const onFrame = (name: StreamName, payload: Buffer) => addLines(name, splitters[name].push(payload.toString("utf8")));

      const onData = tty ? (chunk: Buffer) => onFrame("stdout", chunk) : createDemuxer(onFrame);

      stream.on("data", onData);
      stream.on("error", (err) => fail(socket, err));
      stream.on("end", () => {
        addLines("stdout", splitters.stdout.flush());
        addLines("stderr", splitters.stderr.flush());
        flush();
        clearInterval(timer);
        send(socket, { type: "end" });
        socket.close();
      });
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/containers/:id/stats",
    { websocket: true, schema: { params: idParams } },
    async (socket, req) => {
      let stream: Destroyable | undefined;
      socket.on("close", () => stream?.destroy?.());
      try {
        stream = (await docker.getContainer(req.params.id).stats({ stream: true })) as unknown as Destroyable;
      } catch (err) {
        return fail(socket, err);
      }
      const lines = new LineSplitter();
      stream.on("data", (chunk: Buffer) => {
        for (const line of lines.push(chunk.toString("utf8"))) {
          if (!line.trim()) continue;
          try {
            send(socket, { type: "stats", sample: computeStats(JSON.parse(line) as RawStats) });
          } catch {
            // A malformed sample isn't worth killing the stream over.
          }
        }
      });
      stream.on("error", (err) => fail(socket, err));
      stream.on("end", () => {
        send(socket, { type: "end" });
        socket.close();
      });
    },
  );

  // Interactive shell. Output is sent as binary frames straight to xterm.js;
  // input and resize arrive as JSON text frames.
  app.get<{ Params: { id: string } }>(
    "/api/containers/:id/exec",
    { websocket: true, schema: { params: idParams } },
    async (socket, req) => {
      let stream: NodeJS.ReadWriteStream | undefined;
      let exec: Docker.Exec | undefined;
      // Buffer keystrokes that arrive before the exec has started.
      const early: ExecClientMessage[] = [];
      const handle = (msg: ExecClientMessage) => {
        if (!stream || !exec) return void early.push(msg);
        if (msg.type === "input" && typeof msg.data === "string") stream.write(msg.data);
        else if (msg.type === "resize" && msg.cols > 0 && msg.rows > 0) {
          exec.resize({ w: Math.floor(msg.cols), h: Math.floor(msg.rows) }).catch(() => {});
        }
      };
      socket.on("message", (raw: Buffer, isBinary: boolean) => {
        if (isBinary) return;
        try {
          handle(JSON.parse(raw.toString("utf8")) as ExecClientMessage);
        } catch {
          // ignore malformed frames
        }
      });
      socket.on("close", () => stream?.end());

      try {
        exec = await docker.getContainer(req.params.id).exec({
          Cmd: SHELL_CMD,
          AttachStdin: true,
          AttachStdout: true,
          AttachStderr: true,
          Tty: true,
          Env: ["TERM=xterm-256color"],
        });
        stream = await exec.start({ hijack: true, stdin: true, Tty: true });
      } catch (err) {
        return fail(socket, err);
      }
      stream.on("data", (chunk: Buffer) => {
        if (socket.readyState === socket.OPEN) socket.send(chunk, { binary: true });
      });
      stream.on("end", () => socket.close());
      stream.on("error", (err) => fail(socket, err));
      for (const msg of early.splice(0)) handle(msg);
    },
  );
}
