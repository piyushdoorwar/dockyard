import type Docker from "dockerode";
import type { FastifyInstance } from "fastify";
import { StringDecoder } from "node:string_decoder";
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
/** Bytes queued for a slow browser before we stop reading from Docker. */
const SOCKET_HIGH_WATER = 1024 * 1024;

function send(socket: WebSocket, msg: LiveMessage): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
}

/**
 * Send output from a Docker stream, pausing that stream while the browser is
 * behind. Without this a chatty container (or `yes` in the terminal) queues
 * output in memory faster than the tab can take it.
 */
function sendFrom(source: NodeJS.ReadableStream, socket: WebSocket, data: string | Buffer, binary = false): void {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(data, { binary }, () => {
    if (source.isPaused() && socket.bufferedAmount < SOCKET_HIGH_WATER) source.resume();
  });
  if (socket.bufferedAmount >= SOCKET_HIGH_WATER) source.pause();
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
      let closed = false;
      let tty = false;
      socket.on("close", () => {
        closed = true;
        clearInterval(timer);
        stream?.destroy?.();
      });
      try {
        const container = docker.getContainer(req.params.id);
        // TTY containers send raw bytes; everything else is multiplexed frames.
        tty = Boolean((await container.inspect()).Config?.Tty);
        if (closed) return;
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
      // The browser can leave while Docker is still answering; the close
      // handler above ran before there was a stream to destroy.
      if (closed) return void stream.destroy?.();
      const source = stream;

      let pending: LogLine[] = [];
      const flush = () => {
        if (pending.length === 0) return;
        sendFrom(source, socket, JSON.stringify({ type: "logs", lines: pending } satisfies LiveMessage));
        pending = [];
      };
      timer = setInterval(flush, LOG_FLUSH_MS);

      const splitters: Record<StreamName, LineSplitter> = { stdout: new LineSplitter(), stderr: new LineSplitter() };
      // A multi-byte character can straddle two chunks; decode per stream so it isn't mangled.
      const decoders: Record<StreamName, StringDecoder> = { stdout: new StringDecoder("utf8"), stderr: new StringDecoder("utf8") };
      const addLines = (name: StreamName, lines: string[]) => {
        for (const line of lines) pending.push({ stream: name, ...splitTimestamp(line) });
        if (pending.length >= LOG_BATCH_MAX) flush();
      };
      const onFrame = (name: StreamName, payload: Buffer) =>
        addLines(name, splitters[name].push(decoders[name].write(payload)));

      const onData = tty ? (chunk: Buffer) => onFrame("stdout", chunk) : createDemuxer(onFrame);

      stream.on("data", onData);
      stream.on("error", (err) => fail(socket, err));
      stream.on("end", () => {
        for (const name of ["stdout", "stderr"] as const) {
          addLines(name, splitters[name].push(decoders[name].end()));
          addLines(name, splitters[name].flush());
        }
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
      let closed = false;
      socket.on("close", () => {
        closed = true;
        stream?.destroy?.();
      });
      try {
        stream = (await docker.getContainer(req.params.id).stats({ stream: true })) as unknown as Destroyable;
      } catch (err) {
        return fail(socket, err);
      }
      if (closed) return void stream.destroy?.();
      const lines = new LineSplitter();
      const decoder = new StringDecoder("utf8");
      stream.on("data", (chunk: Buffer) => {
        for (const line of lines.push(decoder.write(chunk))) {
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
      let stream: (NodeJS.ReadWriteStream & { destroy?: () => void }) | undefined;
      let exec: Docker.Exec | undefined;
      let closed = false;
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
      // Ending stdin lets the shell exit; destroying the hijacked connection
      // makes sure it doesn't linger if something in the session ignores EOF.
      const hangUp = (s: typeof stream) => {
        s?.end();
        s?.destroy?.();
      };
      socket.on("close", () => {
        closed = true;
        hangUp(stream);
      });

      let started: typeof stream;
      try {
        const created = await docker.getContainer(req.params.id).exec({
          Cmd: SHELL_CMD,
          AttachStdin: true,
          AttachStdout: true,
          AttachStderr: true,
          Tty: true,
          Env: ["TERM=xterm-256color"],
        });
        if (closed) return;
        started = await created.start({ hijack: true, stdin: true, Tty: true });
        exec = created;
      } catch (err) {
        return fail(socket, err);
      }
      if (closed) return hangUp(started);
      const shell = started;
      stream = shell;
      shell.on("data", (chunk: Buffer) => sendFrom(shell, socket, chunk, true));
      shell.on("end", () => socket.close());
      shell.on("error", (err) => fail(socket, err));
      for (const msg of early.splice(0)) handle(msg);
    },
  );
}
