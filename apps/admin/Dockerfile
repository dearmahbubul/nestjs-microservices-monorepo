# syntax=docker/dockerfile:1.7
#
# Dockerfile for the "admin" Next.js app.
# Build it from the REPOSITORY ROOT so the whole pnpm/turbo workspace is the build context:
#   docker build -f apps/admin/Dockerfile -t admin .
#
# Stages: base -> pruner -> builder -> runner

ARG NODE_VERSION=24-slim
ARG TURBO_VERSION=2.11.7
# The workspace package (app) this image packages.
ARG APP=admin

# ------------------------------------------------------------------ base
# Shared Node + pnpm (enabled through corepack) used by the build stages.
FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# ------------------------------------------------------------------ pruner
# turbo prune carves out the minimal part of the monorepo for this app:
# only the app and the packages it depends on.
#   out/json -> package.json files + lockfile (for install)
#   out/full -> the actual sources (for build)
FROM base AS pruner
ARG APP
ARG TURBO_VERSION
RUN npm install -g turbo@${TURBO_VERSION}
COPY . .
RUN turbo prune --scope=${APP} --docker

# ------------------------------------------------------------------ builder
# Install deps first (this layer is cached unless the lockfile changes),
# then copy the pruned sources and produce the Next.js build.
FROM base AS builder
ARG APP
COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo run build --filter=${APP}

# ------------------------------------------------------------------ runner
# Slim production image running "next start" as a non-root user.
FROM base AS runner
ARG APP
ENV NODE_ENV=production
# APP must be a runtime env var so the CMD below can expand it.
ENV APP=${APP}
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=builder --chown=node:node /app ./
# The Node image already provides a non-root "node" user.
USER node
# Run next directly (no corepack/pnpm needed at runtime).
CMD ["sh", "-c", "exec node apps/${APP}/node_modules/next/dist/bin/next start apps/${APP}"]
