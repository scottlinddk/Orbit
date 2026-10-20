# syntax=docker/dockerfile:1

# Orbit: one image that serves the API and the built web app on one port.
# Build:  docker build -t orbit .
# Run:    docker compose up -d   (see docs/operations/deployment.md)

ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-alpine AS base
# CI=true makes pnpm non-interactive: it may recreate node_modules without asking.
ENV CI=true
RUN corepack enable
WORKDIR /app

# Fetch dependencies from the lockfile, so this layer is reused until the lockfile changes.
# package.json is copied too: its "packageManager" field is what pins the pnpm version.
FROM base AS fetch
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm fetch

# Build the web app. Nothing from this stage ships except apps/web/dist.
FROM fetch AS web
COPY . .
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --offline
RUN pnpm --filter @orbit/web build

# Production dependencies of the API and the packages it uses, nothing else. This stage does not
# start from `pnpm fetch`, which fills the virtual store with every package in the lockfile.
FROM base AS prod
COPY . .
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter "@orbit/api..."

FROM node:${NODE_VERSION}-alpine AS runtime
LABEL org.opencontainers.image.title="Orbit" \
      org.opencontainers.image.description="Self-hostable personal and household dashboard" \
      org.opencontainers.image.source="https://github.com/scottlinddk/Orbit" \
      org.opencontainers.image.licenses="Apache-2.0"

WORKDIR /app
ENV NODE_ENV=production \
    ORBIT_HOST=0.0.0.0 \
    ORBIT_PORT=3000 \
    ORBIT_DATABASE_PATH=/data/orbit.sqlite \
    ORBIT_WEB_DIR=/app/web

# Node runs the TypeScript sources directly (type stripping), so the workspace layout is kept
# as is. Symlinked workspace packages resolve outside node_modules, where Node allows that.
COPY --from=prod /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=prod /app/node_modules ./node_modules
COPY --from=prod /app/apps/api ./apps/api
COPY --from=prod /app/packages ./packages
COPY --from=web /app/apps/web/dist ./web
COPY LICENSE NOTICE ./
COPY deploy/orbit /usr/local/bin/orbit

# The database lives on a volume. The unprivileged user owns it, never root.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.ORBIT_PORT}/api/v1/health`).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

CMD ["node", "--disable-warning=ExperimentalWarning", "apps/api/src/main.ts"]
