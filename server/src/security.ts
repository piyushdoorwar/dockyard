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

/** A Host header as URL parses it: lowercased, default port dropped. */
function parseHost(host: string): URL | null {
  try {
    return new URL(`http://${host}`);
  } catch {
    return null;
  }
}

export function isLoopbackHost(host: string | undefined): boolean {
  if (!host) return false;
  const name = parseHost(host)?.hostname;
  return name !== undefined && LOOPBACK_HOSTNAMES.has(name);
}

/** No Origin (curl, health checks) is fine; otherwise it must be this very server. */
export function isSameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (origin === undefined) return true;
  if (!host) return false;
  try {
    // Compare normalised forms: a browser omits :80 from Origin and lowercases
    // it, while the Host header is sent as typed.
    return new URL(origin).host === parseHost(host)?.host;
  } catch {
    return false;
  }
}

/**
 * Older Safari doesn't treat ws: as matching 'self', so the socket origin is
 * named explicitly — this exact host and port, not every port on localhost.
 */
export function contentSecurityPolicy(host: string | undefined): string {
  const normalised = host && isLoopbackHost(host) ? parseHost(host)?.host : undefined;
  return [
    "default-src 'self'",
    "script-src 'self'",
    // React renders style={...} props as inline style attributes.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    normalised ? `connect-src 'self' ws://${normalised} wss://${normalised}` : "connect-src 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

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

  app.addHook("onSend", async (req, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    // Other sites can still fire no-cors GETs at us (<script src>, <img>);
    // this stops the browser handing them the response body.
    reply.header("Cross-Origin-Resource-Policy", "same-origin");
    reply.header("Content-Security-Policy", contentSecurityPolicy(req.headers.host));
  });
}
