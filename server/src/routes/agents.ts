import type { FastifyInstance } from "fastify";
import { promises as fs } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import type { AgentFile, AgentSection, AgentsManifest } from "../../../shared/types.js";

const IGNORED = new Set([".git", "node_modules", "dist", "build", "coverage", ".next", ".turbo"]);

function parseSections(content: string): AgentSection[] {
  const sections: AgentSection[] = [];
  let current: AgentSection = { level: 0, title: "Overview", body: "" };
  for (const line of content.split(/\r?\n/)) {
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
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
  async function visit(directory: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(
      entries.map(async (entry) => {
        if (entry.isSymbolicLink()) return;
        const fullPath = join(directory, entry.name);
        if (entry.isDirectory() && !IGNORED.has(entry.name)) await visit(fullPath);
        if (entry.isFile() && entry.name.toLowerCase() === "agents.md") found.push(fullPath);
      }),
    );
  }
  await visit(root);
  return found.sort((a, b) => a.localeCompare(b));
}

export async function readAgentsManifest(workspaceRoot: string): Promise<AgentsManifest> {
  const root = resolve(workspaceRoot);
  const paths = await discoverAgentFiles(root);
  const files: AgentFile[] = await Promise.all(
    paths.map(async (path) => {
      const content = await fs.readFile(path, "utf8");
      const relativePath = relative(root, path) || basename(path);
      const slash = relativePath.lastIndexOf("/");
      return {
        path,
        relativePath,
        directory: slash === -1 ? "." : relativePath.slice(0, slash),
        content,
        sections: parseSections(content),
      };
    }),
  );
  return { root, files, scannedAt: new Date().toISOString() };
}

export function agentRoutes(app: FastifyInstance, workspaceRoot: string): void {
  app.get("/api/agents", async () => readAgentsManifest(workspaceRoot));
}
