import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MAX_FILE_BYTES, readAgentsManifest } from "../src/routes/agents.js";

const created: string[] = [];
afterEach(() => {
  for (const directory of created.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("agent instruction discovery", () => {
  it("combines nested AGENTS.md files and parses their headings", async () => {
    const root = mkdtempSync(join(tmpdir(), "dockyard-agents-"));
    created.push(root);
    mkdirSync(join(root, "packages", "api"), { recursive: true });
    writeFileSync(join(root, "AGENTS.md"), "# Workspace\nUse the root rules.\n");
    writeFileSync(join(root, "packages", "api", "AGENTS.md"), "# API\nLocal rules.\n## Tests\nRun the suite.\n");

    const manifest = await readAgentsManifest(root);

    expect(manifest.files.map((file) => file.relativePath)).toEqual(["AGENTS.md", "packages/api/AGENTS.md"]);
    expect(manifest.files[1].sections).toMatchObject([
      { level: 1, title: "API", body: "Local rules." },
      { level: 2, title: "Tests", body: "Run the suite." },
    ]);
  });

  it("does not traverse dependencies or generated output", async () => {
    const root = mkdtempSync(join(tmpdir(), "dockyard-agents-"));
    created.push(root);
    for (const directory of ["node_modules/pkg", "dist", ".git/meta"]) {
      mkdirSync(join(root, directory), { recursive: true });
      writeFileSync(join(root, directory, "AGENTS.md"), "# Ignore me\n");
    }

    const manifest = await readAgentsManifest(root);
    expect(manifest.files).toEqual([]);
  });

  it("doesn't mistake comments in fenced code for headings", async () => {
    const root = mkdtempSync(join(tmpdir(), "dockyard-agents-"));
    created.push(root);
    writeFileSync(join(root, "AGENTS.md"), "# Setup\n```sh\n# install deps\nnpm ci\n```\n## Tests ##\nRun them.\n");

    const [file] = (await readAgentsManifest(root)).files;
    expect(file.sections.map((s) => s.title)).toEqual(["Setup", "Tests"]);
    expect(file.sections[0].body).toBe("```sh\n# install deps\nnpm ci\n```");
  });

  it("cuts oversized files short and flags them", async () => {
    const root = mkdtempSync(join(tmpdir(), "dockyard-agents-"));
    created.push(root);
    writeFileSync(join(root, "AGENTS.md"), "x".repeat(MAX_FILE_BYTES + 10));

    const [file] = (await readAgentsManifest(root)).files;
    expect(file.content.length).toBe(MAX_FILE_BYTES);
    expect(file.truncated).toBe(true);
  });

  it("skips symlinked directories, so a link back up the tree can't loop", async () => {
    const root = mkdtempSync(join(tmpdir(), "dockyard-agents-"));
    created.push(root);
    mkdirSync(join(root, "pkg"));
    writeFileSync(join(root, "pkg", "AGENTS.md"), "# Pkg\n");
    symlinkSync(root, join(root, "pkg", "loop"));

    const manifest = await readAgentsManifest(root);
    expect(manifest.files.map((f) => f.relativePath)).toEqual(["pkg/AGENTS.md"]);
    expect(manifest.files[0].truncated).toBeUndefined();
  });
});
