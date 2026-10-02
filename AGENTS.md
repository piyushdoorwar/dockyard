# CLAUDE.md

Guidance for working in the Dockyard codebase.

## What Dockyard is

Dockyard is a local-first visual runtime for Docker: a small Node server (Fastify +
dockerode) that talks to the local Docker engine through its socket, plus a React UI
served from the same origin. Users run the public image `ghcr.io/piyushdoorwar/dockyard`
with the Docker socket mounted and the current repository mounted read-only at
`/workspace`, then open <http://localhost:41739>.

## Hard rules

- **No emojis or glyph icons anywhere** (no arrows, bullets or symbols as icons). Icons are
  SVG: `lucide-react` in the UI, the inline sprite `site/assets/icons.svg` on the site.
  The brand mark is [web/src/components/Logo.tsx](web/src/components/Logo.tsx).
- **Commits carry only the user's name.** No co-author trailers or "generated with"
  lines. Work directly on `main` (trunk-based); don't create feature branches.
- **Personal project.** Never mention work organisations or other projects in code,
  comments, fixtures, docs or commit messages.
- **Runtime defaults to light, with an optional persisted dark theme; the site stays light.** Colors are tokens in
  [web/src/styles.css](web/src/styles.css) (`--color-primary: #0e7a43`). Green buttons
  carry white text. Don't hard-code other accent colors.

## Commands

```bash
npm install
npm run dev          # API on 127.0.0.1:41739 (tsx watch) + Vite on :5173 (proxies /api + WebSockets)
npm test             # Vitest projects: server (node) + web (jsdom)
npm run typecheck    # tsconfig.server.json (server, shared) + tsconfig.web.json
npm run build        # vite build -> dist/web, tsc -> dist/server
npm start            # node dist/server/src/index.js
docker build -t dockyard .
```

## Layout

```
server/src/   index.ts (env, listen), app.ts (wiring, SPA fallback), security.ts,
              errors.ts (Docker errors -> HTTP), mappers.ts (Docker -> shared types),
              stats.ts (CPU/memory math), streams.ts (log demux),
              routes/*.ts (system, containers, stacks, images, volumes, live, agents)
shared/types.ts   JSON shapes shared by server and web, CSRF_HEADER
web/src/      React 19 + Vite 7 + Tailwind 4 UI
  components/  Button, Modal, Confirm, Toast, DataTable, Page, SideNav, Layout, Logo,
               StatusBadge, TabButton, SearchBar (+ Toggle), Sparkline (+ Meter), PortLinks,
               container/ (LogsView, StatsView, TerminalView, InspectView)
  pages/       Dashboard, Containers, ContainerDetail, Stacks, Images, Volumes, Agents
  lib/         api.ts (fetch client, wsUrl), usePolling, useLiveSocket, useAction,
               useContainerActions, format.ts
server/test, web/test   tests live beside their part
site/         static product site (GitHub Pages), no build step
docker-entrypoint.sh    joins the Docker socket's group, then drops to the node user
```

## Key decisions

- **No login, loopback only** ([server/src/security.ts](server/src/security.ts)): the
  `Host` header must be a loopback name, `Origin` must match `Host`, non-GET requests
  need `x-dockyard: 1`, a per-request CSP limits WebSockets to the page's own host, no
  framing. The documented `docker run` publishes on `127.0.0.1` only.
- **Self-protection.** The image label `com.dockyard.runtime=true` marks Dockyard's own
  container. The server refuses to stop/restart/remove it, and the UI disables those
  actions for it and for any stack that contains it.
- **Lists are polled** (`usePolling`, paused while the tab is hidden); logs, stats and
  the terminal are WebSockets (`routes/live.ts`) with backpressure and cleanup when the
  browser goes away.
- **Agents map** scans `DOCKYARD_WORKSPACE` (default: cwd; `/workspace` in the image)
  for `AGENTS.md`, skipping generated and vendor folders, with depth, directory-count and
  file-size limits and a short result cache.
- **Socket access in the image.** The container starts as root only so the entrypoint
  can add `node` to the socket's group; if the socket isn't group-writable it stays root
  and logs why. Running with `--user` skips this.

## UI conventions

- Tokens in `styles.css` `@theme`: `primary`, `primary-hover`, `primary-soft`,
  `primary-tint`, `ink`, `body`, `grey`, `muted`, `line`, `line-soft`, `canvas`, `danger`
  (+ `-soft`, `-line`), `warning` (+ `-soft`), `success-soft`. Fonts: DM Sans and
  JetBrains Mono.
- Shared classes: `.btn` + `.btn-primary | .btn-cancel | .btn-delete | .btn-danger-outline
  | .btn-ghost` (+ `.btn-sm`), `.input`, `.label`, `.check`, `.data-table`.
- Sidebar: themed surface, wordmark, nav items whose active state is solid green with white
  text; collapses to an icon rail below `md`.
- Tables use `DataTable` (click-to-sort headers, optional expansion rows); give text
  columns a `minWidth` so narrow screens scroll instead of wrapping letter by letter.
- Status pills use soft fills with theme-aware contrasting text.

## Distribution

- [ci.yml](.github/workflows/ci.yml): typecheck, test, build, and a container build on
  every push and PR. It never publishes.
- [release.yml](.github/workflows/release.yml): on `v*` tags, test, push the multi-arch
  `X.Y.Z` / `X.Y` / `X` / `latest` images (pre-release tags get only their exact version;
  0.x skips `:0`) and create the GitHub release.
- [static.yml](.github/workflows/static.yml): deploys `site/` to Pages on site changes
  and after each Release run; `site/releases.json` is generated by
  [generate-site-releases.cjs](.github/scripts/generate-site-releases.cjs).
- The GHCR package must be set to **public** once in its package settings.
