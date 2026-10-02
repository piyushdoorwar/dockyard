# Dockyard

Dockyard is a local-first visual runtime for Docker. It provides a browser UI for containers, Compose stacks, images, volumes, live logs, resource metrics, shell access, disk cleanup, and the `AGENTS.md` instructions spread through a repository.

## Run locally

Requires Node.js 22+ and a running Docker Engine.

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The API listens on `127.0.0.1:41739` and Vite proxies API and WebSocket traffic to it.

By default the agent map scans the directory where Dockyard starts. Set `DOCKYARD_WORKSPACE` to scan another repository:

```bash
DOCKYARD_WORKSPACE=/path/to/repository npm run dev
```

## Run with Docker

The container needs access to the Docker socket and read-only access to the repository whose agent instructions you want to visualize.

```bash
docker build -t dockyard .
docker run --rm --name dockyard \
  -p 127.0.0.1:41739:41739 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$PWD:/workspace:ro" \
  dockyard
```

If your Docker socket is not accessible to the container's `node` user, add its group with `--group-add "$(stat -c '%g' /var/run/docker.sock)"`.

## Commands

- `npm run dev` — run the API and web app with live reload
- `npm run build` — build the production server and web bundle
- `npm run start` — serve the production build
- `npm run typecheck` — type-check server and client
- `npm test` — run the test suite

The static product site lives in `site/` and has no build step.

## Security model

Dockyard has privileged access to the Docker socket, so it is deliberately local-only. It validates loopback hostnames and same-origin requests, requires a custom header for mutations, and binds to `127.0.0.1` outside its container. Keep the published Docker port bound to loopback.
 
