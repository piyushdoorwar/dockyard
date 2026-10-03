# Dockyard

Dockyard is a local-first visual runtime for Docker. It gives your local Docker engine a
browser UI: containers, Compose stacks, images, volumes, live logs, resource metrics, an
interactive terminal, disk cleanup, and one combined map of every `AGENTS.md` in a
repository. Compose discovery finds applications in that repository before their
containers exist.

No account, no cloud, no telemetry. It only answers requests from your own machine.

Site: <https://piyushdoorwar.github.io/dockyard/>

## Run it

You need Docker. Run this from the repository whose Compose and `AGENTS.md` files you want discovered
(it is mounted read-only at `/workspace`):

```bash
docker run -d --name dockyard --restart unless-stopped \
  -p 127.0.0.1:41739:41739 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$PWD:/workspace:ro" \
  ghcr.io/piyushdoorwar/dockyard:latest
```

Then open <http://localhost:41739>.

- **Port.** The app listens on `41739`. To use another host port, change the left side
  only: `-p 127.0.0.1:8080:41739`. Keep the `127.0.0.1:` prefix; the Docker socket is
  root-equivalent, so Dockyard must never be reachable from your network.
- **Docker socket.** The entrypoint joins the socket's group at start-up and then runs
  the server as the unprivileged `node` user, so no `--group-add` is needed. This works
  the same on Linux and Docker Desktop.
- **No workspace?** Leave out the `/workspace` mount; everything except workspace discovery (Compose and Agents)
  works without it.

### Diagnose a failing container

Open a container and select **Diagnostics** to see its current exit code, OOM kill
flag, restart count, engine error, health-check results, and a short recent log
excerpt together. Containers with an unhealthy health check, a nonzero exit code,
or a dead or restarting state link directly to this tab from the Containers list.
The tab refreshes while open and is read-only. These are Docker's observed signals,
not an automatic root-cause diagnosis; use **Logs** for a longer live stream.

### Inspect ports and networks

Open **Networking** to find a published port's owning container, bind address,
protocol, and Compose stack. Search by port or container name; enable **Include
inactive mappings** to see saved bindings for stopped containers, including ports
that will be allocated dynamically on start.

The **Networks** tab shows drivers, subnets, and local container membership. Expand
a network for addresses and DNS aliases, or compare two containers to see whether
they share an active network or network namespace. This checks Docker configuration,
not live service connectivity. Host-network listeners and non-Docker processes are
outside the port inventory. The view is read-only and refreshes every five seconds.

### Discover Compose projects

Open **Compose** to scan the mounted workspace, including nested repositories. Dockyard
finds `compose.yaml`, `compose.yml`, `docker-compose.yaml`, `docker-compose.yml`, and
named variants such as `compose.dev.yaml`. Files are grouped by directory. Standard
base and override files are selected using Compose's filename precedence; open a
project to choose a different base file and an optional override.

The preview shows services, images or local builds, published ports, and profiles.
It uses Docker Compose's configuration resolver, including the project's `.env` file,
and links containers whose Compose source-file labels match the selected files.
Project names alone are not used for matching. Containers started with other file
combinations remain available under **Stacks**.

Choose optional profiles and **Copy command** to get a command to run in the displayed
host directory. Discovery is read-only: it does not start, build, pull, or change
containers, and it does not edit workspace files. The configuration preview omits
environment values, secrets, and raw Compose output.

Previews run against temporary copies of bounded local configuration dependencies,
without Dockyard's environment or Docker connection. Local `include` and `extends`
references are supported. Remote, absolute, variable-based, out-of-workspace, or
symlinked configuration references, and includes with custom `project_directory` or
`env_file`, are reported as unresolved. Missing required files or variables are also
reported; host-shell variables are not available to the preview. Fix these on the
host and rescan, or inspect the configuration with `docker compose config` there.

Scans skip dependency and generated directories and stop at 12 levels, 20,000
directories, or 50 projects. Individual configuration files are limited to 512 KB;
previews have dependency, output, and time limits. A partial scan is clearly marked.

### Update

Dockyard keeps no state of its own, so updating is pull, remove, run again:

```bash
docker pull ghcr.io/piyushdoorwar/dockyard:latest
docker rm -f dockyard
```

Then run the same `docker run` command as above. To stay on a specific release, use a
version tag such as `ghcr.io/piyushdoorwar/dockyard:1.2.3` (or `:1.2`) instead of
`:latest`. All versions are listed on the
[releases page](https://piyushdoorwar.github.io/dockyard/releases/).

Dockyard protects its own container (it carries the `com.dockyard.runtime=true` label),
so stop, restart or remove it from your terminal rather than from the UI.

## Develop

Requires Node.js 22.22.2+, 24.15.0+, or 26+ (CI uses 24) and a running Docker engine. Install the Docker
Compose CLI plugin (`docker compose version`) for configuration previews during local
development; it is bundled in the runtime image. Without it, files are still
discovered and the UI explains that previews are unavailable.

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. The API listens on `127.0.0.1:41739` and Vite proxies API
and WebSocket traffic to it. By default the agent map scans the directory where Dockyard
starts; set `DOCKYARD_WORKSPACE` to scan another repository:

```bash
DOCKYARD_WORKSPACE=/path/to/repository npm run dev
```

- `npm run dev`: API and web app with live reload
- `npm run build`: production server and web bundle into `dist/`
- `npm run start`: serve the production build
- `npm run typecheck`: type-check server and client
- `npm test`: run the test suite
- `docker build -t dockyard .`: build the image locally

The product site lives in `site/` and has no build step.

## Releases

Pushing a `v*` tag (or publishing a release in the GitHub UI) runs
[release.yml](.github/workflows/release.yml): it tests, publishes the multi-arch
`ghcr.io/piyushdoorwar/dockyard` image as `X.Y.Z`, `X.Y`, `X` and `latest`
(pre-releases such as `v1.3.0-beta.1` get only their exact tag), and creates the GitHub
release. The site then redeploys with the new entry on its releases page.

```bash
git tag v0.1.0
git push origin v0.1.0
```

After the first release, set the `dockyard` package to **public** once under the
repository's GitHub package settings so `docker pull` works without logging in.

## Security model

Dockyard has privileged access to the Docker socket and no login, so it only answers its
owner's browser: the `Host` header must be a loopback name, `Origin` must match `Host`,
state-changing requests need the `x-dockyard` header, and the documented command
publishes the port on `127.0.0.1` only.

## License

[MIT](LICENSE)
