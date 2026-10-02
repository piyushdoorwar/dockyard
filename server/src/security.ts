import type { FastifyInstance } from "fastify";
import { CSRF_HEADER } from "../../shared/types.js";

// The Docker socket is root-equivalent on the host, so this server has no login
// and instead relies on being reachable only from this machine:
//
//   1. The documented Docker command publishes on 127.0.0.1 only.
//   2. Host must be a loopback name — blocks DNS-rebinding, where a malicious
//      site points its own hostname at 127.0.0.1 to get same-origin access.
//   3. If the browser sends Origin, it must match Host — blocks other sites from
//      opening our WebSockets (CORS does not protect WebSockets) or POSTing.
//   4. State-changing requests need a custom header — a cross-site form or
//      "simple" fetch can't set one without a CORS preflight, which we never allow.

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function hostnameOf(host: string): string | null {
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return null;
  }
}

export function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false;
  const name = hostnameOf(host);
  return name !== null && LOOPBACK_HOSTNAMES.has(name);
}

/** No Origin (curl, health checks) is fine; otherwise it must be this very server. */
export function isSameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (origin === undefined) return true;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  // PrimeReact positions overlays with inline styles.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self' ws://localhost:* ws://127.0.0.1:* ws://[::1]:*",
  "frame-ancestors 'none'",
].join("; ");

export function registerSecurity(app: FastifyInstance): void {
  app.addHook("onRequest", async (req, reply) => {
    const host = req.headers.host;
    if (!isLoopbackHost(host)) {
      return reply.code(403).send({ error: "Dockyard only accepts requests addressed to localhost." });
    }
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
    if (!isSameOrigin(origin, host)) {
      return reply.code(403).send({ error: "Cross-origin requests are not allowed." });
    }
    if (!SAFE_METHODS.has(req.method) && req.headers[CSRF_HEADER] !== "1") {
      return reply.code(403).send({ error: `Missing ${CSRF_HEADER} header.` });
    }
  });

  app.addHook("onSend", async (_req, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  });
}
