// Writes site/releases.json from the repository's GitHub releases, so the
// static releases page can list them without calling the API from the browser.
const fs = require("node:fs/promises");
const path = require("node:path");

const repo = process.env.GITHUB_REPOSITORY || "piyushdoorwar/dockyard";
const token = process.env.GITHUB_TOKEN;
const outputPath = path.resolve(process.cwd(), "site/releases.json");

async function githubFetch(url) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "Dockyard-Site-Release-Manifest",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function fetchReleases() {
  const releases = [];
  for (let page = 1; ; page += 1) {
    const batch = await githubFetch(`https://api.github.com/repos/${repo}/releases?per_page=100&page=${page}`);
    releases.push(...batch);
    if (batch.length < 100) break;
  }

  return releases
    .filter((release) => !release.draft)
    .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
    .map((release) => ({
      id: release.id,
      tag_name: release.tag_name,
      name: release.name || release.tag_name,
      // Container image tag published for this release (v1.2.3 -> 1.2.3).
      image_tag: String(release.tag_name || "").replace(/^v(?=\d)/, ""),
      // Release notes (markdown), shown as the changelog on the site.
      body: release.body || "",
      prerelease: release.prerelease,
      published_at: release.published_at,
      html_url: release.html_url,
    }));
}

async function main() {
  const releases = await fetchReleases();
  await fs.writeFile(outputPath, `${JSON.stringify(releases, null, 2)}\n`);
  console.log(`Wrote ${releases.length} releases to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
