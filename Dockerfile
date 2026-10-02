# Dockyard — a local-first visual container runtime.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
ARG APP_VERSION=dev
# The self label lets Dockyard recognise and protect its own container.
LABEL com.dockyard.runtime="true" \
      org.opencontainers.image.title="Dockyard" \
      org.opencontainers.image.description="Local-first visual container runtime"
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=41739 \
    APP_VERSION=${APP_VERSION} \
    DOCKYARD_WORKSPACE=/workspace
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# Run as a non-root user. Supply the Docker socket group with --group-add.
USER node
EXPOSE 41739
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:41739/api/health >/dev/null || exit 1
CMD ["node", "dist/server/src/index.js"]
