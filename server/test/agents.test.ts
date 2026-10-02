import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readAgentsManifest } from "../src/routes/agents.js";

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
});
