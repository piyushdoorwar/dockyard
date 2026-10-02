/** An error with an HTTP status, thrown by route handlers. */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

interface DockerLikeError {
  statusCode?: unknown;
  json?: { message?: unknown } | null;
  reason?: unknown;
  message?: unknown;
  code?: unknown;
  syscall?: unknown;
}

/** Socket errors that mean the Docker engine itself isn't reachable. */
const ENGINE_UNREACHABLE = new Set(["ENOENT", "ECONNREFUSED", "EACCES", "ETIMEDOUT"]);

/**
 * Translate an error from dockerode (which carries the Engine API's status code
 * and JSON body) or from our own handlers into a status + readable message.
 */
export function toHttpError(err: unknown): { statusCode: number; message: string } {
  if (err instanceof HttpError) return { statusCode: err.statusCode, message: err.message };
  const e = (err ?? {}) as DockerLikeError;
  if (e.syscall === "connect" && typeof e.code === "string" && ENGINE_UNREACHABLE.has(e.code)) {
    return { statusCode: 503, message: `Can't reach the Docker engine (${e.code}). Is Docker running and is its socket mounted?` };
  }
  const status = typeof e.statusCode === "number" && e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 500;
  const message =
    (typeof e.json?.message === "string" && e.json.message) ||
    (typeof e.reason === "string" && e.reason) ||
    (typeof e.message === "string" && e.message) ||
    "Unexpected error";
  return { statusCode: status, message };
}

/** Docker answers 304 when a container is already in the requested state. */
export function isNotModified(err: unknown): boolean {
  return (err as DockerLikeError | undefined)?.statusCode === 304;
}
