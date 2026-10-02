#!/bin/sh
# Give the unprivileged node user access to the mounted Docker socket, then drop
# root. The socket's group id differs between hosts (and is root on Docker
# Desktop), so it is read at start-up instead of being baked into the image.
set -e

SOCKET="${DOCKER_SOCKET:-/var/run/docker.sock}"

# Started with --user: nothing to adjust.
if [ "$(id -u)" != "0" ]; then
  exec "$@"
fi

if [ -S "$SOCKET" ]; then
  gid="$(stat -c %g "$SOCKET")"
  group="$(getent group "$gid" | cut -d: -f1)"
  if [ -z "$group" ]; then
    addgroup -g "$gid" docker-host
    group=docker-host
  fi
  addgroup node "$group" 2>/dev/null || true
  if ! su-exec node test -r "$SOCKET" -a -w "$SOCKET"; then
    echo "dockyard: $SOCKET is not writable by its group; running as root." >&2
    exec "$@"
  fi
else
  echo "dockyard: no Docker socket at $SOCKET; mount it with -v /var/run/docker.sock:/var/run/docker.sock" >&2
fi

exec su-exec node "$@"
