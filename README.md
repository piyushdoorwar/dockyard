# Dockyard

Dockyard is a local-first visual runtime for Docker. It gives your local Docker engine a
browser UI: containers, Compose stacks, images, volumes, live logs, resource metrics, an
interactive terminal, disk cleanup, and one combined map of every `AGENTS.md` in a
repository.

No account, no cloud, no telemetry. It only answers requests from your own machine.

Site: <https://piyushdoorwar.github.io/dockyard/>

## Run it

You need Docker. Run this from the repository whose `AGENTS.md` files you want mapped
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
- **No workspace?** Leave out the `/workspace` mount; everything except the Agents page
  works without it.

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

Requires Node.js 22+ (CI uses 24) and a running Docker engine.

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
