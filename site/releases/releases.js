/*
 * Releases page: reads ../releases.json (written by CI from the GitHub
 * releases API) and renders each version with its image pull command,
 * tags and changelog.
 */
(function () {
  "use strict";

  const IMAGE = "ghcr.io/piyushdoorwar/dockyard";
  const ICONS = "../assets/icons.svg";
  const PER_PAGE = 10;

  let all = [];
  let page = 1;
  let stableOnly = true;

  const $ = (id) => document.getElementById(id);
  const loadingEl = $("rel-loading");
  const errorEl = $("rel-error");
  const emptyEl = $("rel-empty");
  const listEl = $("rel-list");
  const pager = $("pager");
  const prevBtn = $("page-prev");
  const nextBtn = $("page-next");
  const pageLabel = $("page-label");
  const stableToggle = $("stableOnly");

  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const icon = (name, extra = "") =>
    `<svg class="ic${extra ? " " + extra : ""}" aria-hidden="true"><use href="${ICONS}#i-${name}" /></svg>`;

  // Prefer the tag CI recorded; otherwise derive it from the git tag (v1.2.3 -> 1.2.3).
  const imageTag = (r) => r.image_tag || String(r.tag_name || "").replace(/^v(?=\d)/, "");

  // Floating tags that move with each stable X.Y.Z release: X.Y, and X from 1.0 on.
  // Older releases have since been overtaken, so these are shown on the newest one only.
  function floatingTags(tag) {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(tag);
    if (!m) return [];
    const tags = [`${m[1]}.${m[2]}`];
    if (m[1] !== "0") tags.push(m[1]);
    return tags;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  // Release notes get a small, safe subset of Markdown: escape first, then format.
  function inline(text) {
    return esc(text)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" rel="noreferrer">$1</a>')
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" rel="noreferrer">$2</a>');
  }

  function renderMarkdown(md) {
    const lines = String(md || "").replace(/\r\n/g, "\n").split("\n");
    const out = [];
    let inList = false;
    let para = [];
    const flushPara = () => {
      if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
      para = [];
    };
    const closeList = () => {
      if (inList) out.push("</ul>");
      inList = false;
    };
    for (const raw of lines) {
      const line = raw.trim();
      const heading = /^#{1,6}\s+(.*)$/.exec(line);
      const item = /^[-*+]\s+(.*)$/.exec(line);
      if (!line) {
        flushPara();
        closeList();
      } else if (heading) {
        flushPara();
        closeList();
        out.push(`<h4>${inline(heading[1])}</h4>`);
      } else if (item) {
        flushPara();
        if (!inList) {
          out.push("<ul>");
          inList = true;
        }
        out.push(`<li>${inline(item[1])}</li>`);
      } else {
        closeList();
        para.push(line);
      }
    }
    flushPara();
    closeList();
    return out.join("");
  }

  function copyBlock(cmd, label) {
    return `<div class="cmd">
      <pre><code><span class="prompt">$ </span>${esc(cmd)}</code></pre>
      <button class="copy-btn" type="button" data-copy="${esc(cmd)}" aria-label="${esc(label)}">
        ${icon("copy", "i-copy")}
        ${icon("check", "i-check")}
        <span>Copy</span>
      </button>
    </div>`;
  }

  function renderRelease(r, latestId) {
    const tag = imageTag(r);
    const isLatest = r.id === latestId;
    const notes = String(r.body || "").trim();
    const title = r.name && r.name !== r.tag_name ? `<p class="release-name">${esc(r.name)}</p>` : "";
    const tags = isLatest ? [tag, ...floatingTags(tag), "latest"] : [tag];

    return `<article class="release${isLatest ? " latest" : ""}">
      <div class="release-head">
        <h3>${esc(r.tag_name)}</h3>
        ${isLatest ? '<span class="badge badge-latest">Latest</span>' : ""}
        ${r.prerelease ? '<span class="badge badge-pre">Pre-release</span>' : ""}
        <time class="release-date" datetime="${esc(r.published_at)}">${formatDate(r.published_at)}</time>
      </div>
      ${title}
      ${copyBlock(`docker pull ${IMAGE}:${tag}`, `Copy pull command for ${tag}`)}
      <div class="tags" aria-label="Image tags">
        ${tags.map((t) => `<span>${icon("tag")}${esc(t)}</span>`).join("")}
      </div>
      ${
        notes
          ? `<details class="changelog"${isLatest ? " open" : ""}>
              <summary>${icon("chevron")}Changelog</summary>
              <div class="md">${renderMarkdown(notes)}</div>
            </details>`
          : ""
      }
      <div class="release-links">
        <a href="${esc(r.html_url)}" rel="noreferrer">${icon("github")}Release on GitHub</a>
      </div>
    </article>`;
  }

  function render() {
    const filtered = all.filter((r) => !stableOnly || !r.prerelease);
    const latestStable = all.find((r) => !r.prerelease);

    if (!filtered.length) {
      listEl.innerHTML = "";
      emptyEl.classList.remove("hidden");
      pager.hidden = true;
      return;
    }
    emptyEl.classList.add("hidden");

    const pages = Math.ceil(filtered.length / PER_PAGE);
    page = Math.min(Math.max(page, 1), pages);
    const slice = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
    listEl.innerHTML = slice.map((r) => renderRelease(r, latestStable?.id)).join("");

    pager.hidden = pages <= 1;
    pageLabel.textContent = `Page ${page} of ${pages}`;
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= pages;
  }

  const jumpToList = () => window.scrollTo(0, listEl.offsetTop - 120);

  stableToggle.addEventListener("change", () => {
    stableOnly = stableToggle.checked;
    page = 1;
    render();
  });
  prevBtn.addEventListener("click", () => {
    page -= 1;
    render();
    jumpToList();
  });
  nextBtn.addEventListener("click", () => {
    page += 1;
    render();
    jumpToList();
  });

  (async function init() {
    try {
      const res = await fetch("../releases.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`Release manifest returned ${res.status}`);
      const data = await res.json();
      all = (Array.isArray(data) ? data : [])
        .filter((r) => !r.draft)
        .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
      loadingEl.classList.add("hidden");
      render();
    } catch {
      loadingEl.classList.add("hidden");
      errorEl.classList.remove("hidden");
    }
  })();
})();
