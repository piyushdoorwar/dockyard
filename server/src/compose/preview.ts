import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { parseDocument } from "yaml";
import type { ComposeService } from "../../../shared/types.js";
import { readWorkspaceFile, referencedPath } from "./discovery.js";

const exec = promisify(execFile);
type RecordValue = Record<string, unknown>;
function object(value: unknown): RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}
function list(value: unknown): unknown[] { return value === undefined ? [] : Array.isArray(value) ? value : [value]; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []; }

export interface Preview { name: string; services: ComposeService[]; profiles: string[]; issues: string[]; resolved: boolean }
export type ComposeRunner = (args: string[], cwd: string, home: string) => Promise<{ stdout: string; stderr: string }>;

export const runCompose: ComposeRunner = (args, cwd, home) => exec("docker", args, {
  cwd,
  timeout: 8_000,
  maxBuffer: 2 * 1024 * 1024,
  // Configuration inspection must not inherit Dockyard's environment, registry
  // credentials, CLI configuration, or a usable Docker daemon connection.
  env: {
    PATH: process.env.PATH,
    HOME: home,
    DOCKER_CONFIG: home,
    DOCKER_HOST: "unix:///nonexistent-dockyard-preview.sock",
    COMPOSE_DISABLE_ENV_FILE: "1",
    COMPOSE_ANSI: "never",
  },
});

/** Compose does the merging/interpolation. YAML is used only to collect bounded local dependencies. */
export async function previewCompose(root: string, directory: string, files: string[], defaultName: string, runner = runCompose): Promise<Preview> {
  const empty: Preview = { name: defaultName, services: [], profiles: [], issues: [], resolved: false };
  const temporary = await fs.mkdtemp(join(tmpdir(), "dockyard-compose-"));
  const snapshotRoot = join(temporary, "workspace");
  const projectDirectory = resolve(root, directory);
  // Preserve the actual project's basename for Compose's default project naming.
  const snapshotProject = join(snapshotRoot, directory === "." ? defaultName : directory);
  const sourceRoot = directory === "." ? join(snapshotRoot, defaultName) : snapshotRoot;
  const destination = (path: string) => join(sourceRoot, relative(root, path));
  const copied = new Set<string>();
  const visited = new Set<string>();
  let totalBytes = 0;
  async function copy(path: string, optional = false): Promise<string | undefined> {
    let content: string;
    try { content = await readWorkspaceFile(root, path); }
    catch (err) {
      if (optional && (err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      if ((err as NodeJS.ErrnoException).code) throw new Error(`Cannot read required configuration file: ${relative(root, path)}.`);
      throw err;
    }
    if (!copied.has(path)) {
      totalBytes += Buffer.byteLength(content);
      if (copied.size >= 100 || totalBytes > 4 * 1024 * 1024) throw new Error("Configuration dependencies exceed the preview size limit.");
      copied.add(path);
      await fs.mkdir(dirname(destination(path)), { recursive: true });
      await fs.writeFile(destination(path), content, { mode: 0o600 });
    }
    return content;
  }
  async function collect(path: string, base: string, depth = 0): Promise<void> {
    if (depth > 12) throw new Error("Configuration dependencies exceed the preview depth limit.");
    const key = `${path}\n${base}`;
    if (visited.has(key)) return;
    visited.add(key);
    const content = await copy(path);
    const doc = parseDocument(content!, { logLevel: "silent" });
    if (doc.errors.length) throw new Error(`Invalid YAML in ${relative(root, path)}. Check it with docker compose config on the host.`);
    let model: RecordValue;
    try { model = object(doc.toJS({ maxAliasCount: 50 })); }
    catch { throw new Error("Configuration YAML contains too many aliases."); }
    for (const item of list(model.include)) {
      const include = object(item);
      if (include.project_directory !== undefined || include.env_file !== undefined) {
        throw new Error("Includes with a custom project_directory or env_file must be previewed on the host.");
      }
      const paths = list(typeof item === "string" ? item : include.path);
      let includeBase: string | undefined;
      for (const value of paths) {
        const child = referencedPath(root, base, value);
        includeBase ??= dirname(child);
        await copy(join(includeBase, ".env"), true);
        await collect(child, includeBase, depth + 1);
      }
    }
    for (const service of Object.values(object(model.services))) {
      const config = object(service);
      const extendsFile = object(config.extends).file;
      if (extendsFile !== undefined) await collect(referencedPath(root, base, extendsFile), base, depth + 1);
      for (const item of list(config.env_file)) {
        const entry = object(item);
        await copy(referencedPath(root, base, typeof item === "string" ? item : entry.path), entry.required === false);
      }
      for (const value of list(config.label_file)) await copy(referencedPath(root, base, value));
    }
  }
  try {
    await fs.mkdir(snapshotProject, { recursive: true });
    for (const file of files) await collect(join(projectDirectory, file), projectDirectory);
    const envFile = join(projectDirectory, ".env");
    if (await copy(envFile, true) === undefined) await fs.writeFile(destination(envFile), "", { mode: 0o600 });
    const args = ["compose", "--project-directory", snapshotProject, "--env-file", destination(envFile), "--profile", "*",
      ...files.flatMap((file) => ["-f", join(snapshotProject, file)]), "config", "--format", "json", "--no-env-resolution"];
    let output: { stdout: string; stderr: string };
    try { output = await runner(args, snapshotProject, temporary); }
    catch (err) {
      const error = err as { code?: string; killed?: boolean; stderr?: string };
      if (error.code === "ENOENT" || /not a docker command|unknown command.*compose/i.test(error.stderr ?? "")) {
        throw new Error("Docker Compose is unavailable. Install the Compose plugin for local development, or use the updated Dockyard image.");
      }
      if (error.killed || error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") throw new Error("Compose preview exceeded its time or output limit.");
      // Compose errors can contain interpolated secrets and source lines. Never return raw output.
      const variable = /required variable ([A-Za-z_][A-Za-z0-9_]*)/.exec(error.stderr ?? "")?.[1];
      throw new Error(variable ? `Missing required variable ${variable}. Add it to this project's .env file.` :
        "Compose could not resolve this configuration. Check required variables, referenced files, and run docker compose config on the host.");
    }
    const model = object(JSON.parse(output.stdout));
    const services = Object.entries(object(model.services)).map(([name, value]): ComposeService => {
      const service = object(value);
      return {
        name,
        image: typeof service.image === "string" ? service.image : null,
        build: service.build !== undefined,
        profiles: strings(service.profiles),
        ports: list(service.ports).map((value) => {
          if (typeof value === "string" || typeof value === "number") return String(value);
          const port = object(value);
          return `${port.host_ip ? `${port.host_ip}:` : ""}${port.published ? `${port.published}:` : ""}${port.target ?? ""}/${port.protocol ?? "tcp"}`;
        }),
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
    // Compose versions emit either plain quotes or escaped quotes inside logfmt messages.
    const missing = [...output.stderr.matchAll(/The \\?["']([A-Za-z_][A-Za-z0-9_]*)\\?["'] variable is not set/g)].map((m) => m[1]);
    const issues = missing.length ? [`Variables not set: ${[...new Set(missing)].join(", ")}. Compose substituted empty strings; add values to the project's .env file.`] : [];
    return { name: typeof model.name === "string" ? model.name : defaultName, services,
      profiles: [...new Set(services.flatMap((s) => s.profiles))].sort(), issues, resolved: !issues.length };
  } catch (err) {
    return { ...empty, issues: [err instanceof SyntaxError ? "Compose returned an invalid configuration preview." : (err as Error).message] };
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}
