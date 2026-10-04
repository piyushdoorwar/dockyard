// Writes site/stats.json with the container image's lifetime download count.
// GHCR has no API for this number, so it is read from the public package page.
// Any failure keeps the last known value and never fails the deploy.
const fs = require("node:fs/promises");
const path = require("node:path");

const repo = process.env.GITHUB_REPOSITORY || "piyushdoorwar/dockyard";
const packageName = process.env.PACKAGE_NAME || repo.split("/")[1];
const packageUrl = `https://github.com/${repo}/pkgs/container/${packageName}`;
const outputPath = path.resolve(process.cwd(), "site/stats.json");

/** The "Total downloads" figure, e.g. `<span ...>Total downloads</span> <h3 title="1342">1.3k</h3>`. */
function parseTotalDownloads(html) {
  const match = /Total downloads\s*<\/span>\s*<h3[^>]*\btitle="([\d,]+)"/i.exec(html);
  if (!match) return null;
  const count = Number(match[1].replace(/,/g, ""));
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

async function readPrevious() {
  try {
    const previous = JSON.parse(await fs.readFile(outputPath, "utf8"));
    return Number.isSafeInteger(previous.downloads) ? previous : null;
  } catch {
    return null;
  }
}

async function main() {
  const previous = await readPrevious();
  let downloads = null;
  try {
    const response = await fetch(packageUrl, { headers: { "User-Agent": "Dockyard-Site-Stats" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    downloads = parseTotalDownloads(await response.text());
    if (downloads === null) throw new Error("download count not found on the package page");
  } catch (error) {
    console.warn(`Could not read downloads from ${packageUrl}: ${error.message}. Keeping the last known value.`);
    return;
  }
  // A lifetime count only grows; never publish a smaller number than before.
  if (previous && downloads < previous.downloads) downloads = previous.downloads;
  const stats = { downloads, package_url: packageUrl, updated_at: new Date().toISOString() };
  await fs.writeFile(outputPath, `${JSON.stringify(stats, null, 2)}\n`);
  console.log(`Wrote ${downloads} downloads to ${outputPath}`);
}

if (require.main === module) {
  main().catch((error) => console.warn(error));
}

module.exports = { parseTotalDownloads };
