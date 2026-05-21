# syntax=docker/dockerfile:1.7

# ---------- 1. Install workspace deps ----------
FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml ./
COPY server/package.json server/
COPY web/package.json web/
RUN pnpm install --frozen-lockfile=false

# ---------- 2. Build SPA ----------
FROM deps AS build-web
WORKDIR /app
COPY web ./web
RUN pnpm --filter ./web build

# ---------- 3. Build server ----------
FROM deps AS build-server
WORKDIR /app
COPY server ./server
RUN pnpm --filter ./server build

# ---------- 4. Runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
RUN corepack enable

COPY package.json pnpm-workspace.yaml ./
COPY server/package.json server/
COPY --from=build-server /app/server/dist server/dist
COPY --from=build-web /app/web/dist web/dist

# Server has no native deps beyond Nest core; install prod-only here.
RUN pnpm install --filter ./server --prod --frozen-lockfile=false

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server/dist/main.js"]
