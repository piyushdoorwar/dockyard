import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";
import type { ContainerSummary } from "../../shared/types";
import { Providers } from "../src/App";

export interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

type Handler = (call: Call) => unknown;

/**
 * Stub fetch with "METHOD /path" → handler. Handlers return the JSON body, or
 * throw `{ status, error }` to simulate a failing request. Unmatched calls 404.
 */
export function mockApi(routes: Record<string, Handler | unknown>) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const call: Call = {
      method,
      url,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    const key = `${method} ${url}`;
    if (!(key in routes)) return new Response(JSON.stringify({ error: `no mock for ${key}` }), { status: 404 });
    const route = routes[key];
    try {
      const body = typeof route === "function" ? (route as Handler)(call) : route;
      return new Response(JSON.stringify(body ?? { ok: true }), { status: 200 });
    } catch (err) {
      const e = err as { status?: number; error?: string };
      return new Response(JSON.stringify({ error: e.error ?? "failed" }), { status: e.status ?? 500 });
    }
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock, mutations: () => calls.filter((c) => c.method !== "GET") };
}

export function renderPage(ui: ReactElement, route = "/") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Providers>{ui}</Providers>
    </MemoryRouter>,
  );
}

export function container(over: Partial<ContainerSummary> & { id: string; name: string }): ContainerSummary {
  return {
    shortId: over.id.slice(0, 12),
    image: "nginx:alpine",
    imageId: "sha256:1",
    state: "running",
    status: "Up 2 hours",
    created: Math.floor(Date.now() / 1000) - 3600,
    ports: [],
    project: null,
    projectDir: null,
    service: null,
    isSelf: false,
    ...over,
  };
}

/** Controllable stand-in for the browser WebSocket. */
export class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  readyState = 0;
  binaryType = "blob";
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  emit(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  serverClose() {
    this.readyState = 3;
    this.onclose?.();
  }
  static install() {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
  }
  static last() {
    return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  }
}
