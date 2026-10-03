import type Docker from "dockerode";
import type { FastifyInstance } from "fastify";
import { StringDecoder } from "node:string_decoder";
import type { ContainerDiagnostics, LogLine } from "../../../shared/types.js";
import { createDemuxer, LineSplitter, splitTimestamp, type StreamName } from "../streams.js";
import { idParams } from "./schemas.js";

const LOG_TAIL = 80;
const MAX_LOG_TEXT = 32_768;
const MAX_LINE = 1_000;
const MAX_HEALTH_OUTPUT = 2_000;

function recentLines(buffer: Buffer, tty: boolean): LogLine[] {
  const lines: LogLine[] = [];
  const splitters: Record<StreamName, LineSplitter> = { stdout: new LineSplitter(), stderr: new LineSplitter() };
  const decoders: Record<StreamName, StringDecoder> = { stdout: new StringDecoder("utf8"), stderr: new StringDecoder("utf8") };
  const add = (stream: StreamName, values: string[]) => {
    for (const value of values) {
      const { ts, text } = splitTimestamp(value);
      lines.push({ stream, ts, text: text.slice(0, MAX_LINE) });
    }
  };
  const frame = (stream: StreamName, payload: Buffer) => add(stream, splitters[stream].push(decoders[stream].write(payload)));
  if (tty) frame("stdout", buffer);
  else createDemuxer(frame)(buffer);
  for (const stream of ["stdout", "stderr"] as const) {
    add(stream, splitters[stream].push(decoders[stream].end()));
    add(stream, splitters[stream].flush());
  }
  const recent = lines.slice(-LOG_TAIL);
  let remaining = MAX_LOG_TEXT;
  const bounded: LogLine[] = [];
  for (let i = recent.length - 1; i >= 0 && remaining > 0; i--) {
    const line = recent[i];
    const text = line.text.slice(-remaining);
    bounded.unshift({ ...line, text });
    remaining -= text.length;
  }
  return bounded;
}

export async function readDiagnostics(container: Docker.Container): Promise<ContainerDiagnostics> {
  const info = await container.inspect();
  let logs: LogLine[] = [];
  let logError: string | null = null;
  try {
    const raw = await container.logs({ follow: false, stdout: true, stderr: true, timestamps: true, tail: LOG_TAIL });
    logs = recentLines(raw, !!info.Config?.Tty);
  } catch {
    logError = "Recent logs are unavailable from this container's logging driver.";
  }
  const state = info.State;
  return {
    id: info.Id,
    status: state.Status,
    exitCode: state.ExitCode,
    oomKilled: !!state.OOMKilled,
    restartCount: info.RestartCount ?? 0,
    engineError: state.Error || null,
    startedAt: state.StartedAt || null,
    finishedAt: state.FinishedAt || null,
    health: state.Health ? {
      status: state.Health.Status,
      failingStreak: state.Health.FailingStreak ?? 0,
      checks: (state.Health.Log ?? []).slice(-5).map((check) => ({
        startedAt: check.Start,
        finishedAt: check.End,
        exitCode: check.ExitCode,
        output: (check.Output ?? "").slice(0, MAX_HEALTH_OUTPUT),
      })),
    } : null,
    logs,
    logError,
    collectedAt: new Date().toISOString(),
  };
}

export function diagnosticsRoutes(app: FastifyInstance, docker: Docker): void {
  app.get<{ Params: { id: string } }>("/api/containers/:id/diagnostics", { schema: { params: idParams } },
    async (req) => readDiagnostics(docker.getContainer(req.params.id)));
}
