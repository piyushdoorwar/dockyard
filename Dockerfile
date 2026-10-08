# Dockyard: a local-first visual runtime for Docker, served in your browser.
#   docker run -d --name dockyard -p 127.0.0.1:41739:41739 \
#     -v /var/run/docker.sock:/var/run/docker.sock -v "$PWD:/workspace:ro" \
#     ghcr.io/piyushdoorwar/dockyard
# then open http://localhost:41739

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
ARG APP_VERSION=dev
# The runtime label lets Dockyard recognise and protect its own container.
LABEL com.dockyard.runtime="true" \
      org.opencontainers.image.url="https://dockyard.piyushdoorwar.com/" \
      org.opencontainers.image.source="https://github.com/piyushdoorwar/dockyard" \
      org.opencontainers.image.title="Dockyard" \
      org.opencontainers.image.description="Local-first visual runtime for Docker, in your browser" \
      org.opencontainers.image.licenses="MIT"
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=41739 \
    APP_VERSION=${APP_VERSION} \
    DOCKYARD_WORKSPACE=/workspace
RUN apk add --no-cache su-exec docker-cli-compose
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /workspace

# Starts as root only long enough for the entrypoint to join the Docker socket's
# group, then runs the server as the unprivileged node user.
EXPOSE 41739
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:41739/api/health >/dev/null || exit 1
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/server/src/index.js"]
