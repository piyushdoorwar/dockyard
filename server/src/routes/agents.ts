import type { FastifyInstance } from "fastify";
import { promises as fs } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import type { AgentFile, AgentSection, AgentsManifest } from "../../../shared/types.js";

const IGNORED = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "bower_components",
  "vendor",
  "dist",
  "build",
  "out",
  "target",
  "coverage",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  ".venv",
  "venv",
  "__pycache__",
  ".tox",
  ".gradle",
  ".terraform",
]);
/** Deep enough for any monorepo layout; stops a workspace pointed at / from walking the disk. */
const MAX_DEPTH = 12;
const MAX_DIRECTORIES = 20_000;
/** Instruction files are prose; anything bigger is shown cut short rather than loaded whole. */
export const MAX_FILE_BYTES = 512 * 1024;
/** The UI polls this; a short cache keeps several open tabs from rescanning the tree each. */
const CACHE_MS = 2_000;

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

function parseSections(content: string): AgentSection[] {
  const sections: AgentSection[] = [];
  let current: AgentSection = { level: 0, title: "Overview", body: "" };
  // Inside a fenced code block a "# comment" is shell, not a heading.
  let fence: string | null = null;
  for (const line of content.split(/\r?\n/)) {
    const marker = FENCE.exec(line)?.[1];
    if (marker) {
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
    }
    const heading = fence === null && !marker ? /^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+)?\s*$/.exec(line) : null;
    if (heading) {
      if (current.body.trim() || current.title !== "Overview") sections.push({ ...current, body: current.body.trim() });
      current = { level: heading[1].length, title: heading[2], body: "" };
    } else {
      current.body += `${line}\n`;
    }
  }
  if (current.body.trim() || current.title !== "Overview") sections.push({ ...current, body: current.body.trim() });
  return sections;
}

async function discoverAgentFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  let directories = 0;
  async function visit(directory: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH || ++directories > MAX_DIRECTORIES) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(
      entries.map(async (entry) => {
        // Symlinks are skipped outright, so a link back up the tree can't loop.
        if (entry.isSymbolicLink()) return;
        const fullPath = join(directory, entry.name);
        if (entry.isDirectory() && !IGNORED.has(entry.name)) await visit(fullPath, depth + 1);
        if (entry.isFile() && entry.name.toLowerCase() === "agents.md") found.push(fullPath);
      }),
    );
  }
  await visit(root, 0);
  return found.sort((a, b) => a.localeCompare(b));
}

/** Up to MAX_FILE_BYTES of the file, or null if it vanished or can't be read. */
async function readCapped(path: string): Promise<{ content: string; truncated: boolean } | null> {
  let handle: import("node:fs/promises").FileHandle | undefined;
  try {
    handle = await fs.open(path, "r");
    const buf = Buffer.alloc(MAX_FILE_BYTES + 1);
    const { bytesRead } = await handle.read(buf, 0, buf.length, 0);
    const truncated = bytesRead > MAX_FILE_BYTES;
    // Cutting mid-character leaves a replacement char at the end at worst.
    return { content: buf.subarray(0, Math.min(bytesRead, MAX_FILE_BYTES)).toString("utf8"), truncated };
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {});
  }
}

export async function readAgentsManifest(workspaceRoot: string): Promise<AgentsManifest> {
  const root = resolve(workspaceRoot);
  const paths = await discoverAgentFiles(root);
  const read = await Promise.all(
    paths.map(async (path): Promise<AgentFile | null> => {
      const file = await readCapped(path);
      if (!file) return null;
      const relativePath = relative(root, path) || basename(path);
      const slash = relativePath.lastIndexOf("/");
      return {
        path,
        relativePath,
        directory: slash === -1 ? "." : relativePath.slice(0, slash),
        content: file.content,
        sections: parseSections(file.content),
        ...(file.truncated ? { truncated: true } : {}),
      };
    }),
  );
  const files = read.filter((f): f is AgentFile => f !== null);
  return { root, files, scannedAt: new Date().toISOString() };
}

export function agentRoutes(app: FastifyInstance, workspaceRoot: string): void {
  let cached: { at: number; manifest: Promise<AgentsManifest> } | undefined;
  app.get("/api/agents", async () => {
    if (!cached || Date.now() - cached.at > CACHE_MS) {
      const entry = { at: Date.now(), manifest: readAgentsManifest(workspaceRoot) };
      cached = entry;
      // A failed scan shouldn't be served from cache.
      entry.manifest.catch(() => {
        if (cached === entry) cached = undefined;
      });
    }
    return cached.manifest;
  });
}
