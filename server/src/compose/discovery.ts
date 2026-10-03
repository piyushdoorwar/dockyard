import { constants, promises as fs } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const IGNORED = new Set([
  ".git", ".hg", ".svn", "node_modules", "bower_components", "vendor", "dist", "build", "out", "target",
  "coverage", ".next", ".nuxt", ".turbo", ".cache", ".venv", "venv", "__pycache__", ".tox", ".gradle", ".terraform",
]);
const BASE_NAMES = ["compose.yaml", "compose.yml", "docker-compose.yml", "docker-compose.yaml"];
const OVERRIDE_NAMES = ["compose.override.yml", "compose.override.yaml", "docker-compose.override.yml", "docker-compose.override.yaml"];
export const MAX_FILE_BYTES = 512 * 1024;
export interface DiscoveredProject { directory: string; files: string[]; selectedFiles: string[] }

export function inside(root: string, path: string): boolean {
  const rel = relative(root, path);
  return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/** Do not follow repository symlinks or read special files during discovery/preview. */
export async function readWorkspaceFile(root: string, path: string): Promise<string> {
  if (!inside(root, path)) throw new Error("A referenced file is outside the mounted workspace.");
  let current = root;
  for (const part of relative(root, path).split(sep).filter(Boolean)) {
    current = join(current, part);
    if ((await fs.lstat(current)).isSymbolicLink()) throw new Error("Symlinked configuration files are not previewed.");
  }
  const handle = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error("A referenced configuration is not a regular file.");
    if (stat.size > MAX_FILE_BYTES) throw new Error("A configuration file exceeds the 512 KB preview limit.");
    const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_FILE_BYTES) throw new Error("A configuration file exceeds the 512 KB preview limit.");
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

export async function discoverCompose(root: string): Promise<{ projects: DiscoveredProject[]; warnings: string[] }> {
  root = resolve(root);
  const projects: DiscoveredProject[] = [];
  const warnings = new Set<string>();
  let directories = 0;
  async function visit(path: string, depth: number): Promise<void> {
    if (depth > 12 || ++directories > 20_000 || projects.length >= 50) {
      warnings.add("Scan limit reached; mount a smaller workspace to discover the remaining projects.");
      return;
    }
    let entries;
    try { entries = await fs.readdir(path, { withFileTypes: true }); }
    catch {
      warnings.add(path === root ? "Workspace is missing or unreadable. Mount a repository at /workspace." : "Some workspace directories could not be read.");
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    const files = entries.filter((e) => e.isFile() && /^(?:docker-)?compose(?:\.[\w.-]+)?\.ya?ml$/.test(e.name)).map((e) => e.name);
    const base = BASE_NAMES.find((name) => files.includes(name)) ?? files.find((name) => !name.includes(".override."));
    if (base) {
      const override = BASE_NAMES.includes(base) ? OVERRIDE_NAMES.find((name) => files.includes(name)) : undefined;
      projects.push({ directory: relative(root, path) || ".", files, selectedFiles: [base, ...(override ? [override] : [])] });
    } else if (files.length) {
      // An orphan override is still discoverable; Compose will explain that it is incomplete.
      projects.push({ directory: relative(root, path) || ".", files, selectedFiles: [files[0]] });
    }
    for (const entry of entries) {
      if (entry.isDirectory() && !IGNORED.has(entry.name)) await visit(join(path, entry.name), depth + 1);
      if (directories > 20_000 || projects.length >= 50) {
        warnings.add("Scan limit reached; mount a smaller workspace to discover the remaining projects.");
        break;
      }
    }
  }
  await visit(root, 0);
  return { projects, warnings: [...warnings] };
}

export function referencedPath(root: string, directory: string, value: unknown): string {
  if (typeof value !== "string" || !value || isAbsolute(value) || /[$\x00-\x1f]|^[a-z][a-z0-9+.-]*:/i.test(value)) {
    throw new Error("Preview requires local, relative configuration references without variables. Resolve this configuration on the host.");
  }
  const path = resolve(directory, value);
  if (!inside(root, path)) throw new Error("A referenced file is outside the mounted workspace.");
  return path;
}
