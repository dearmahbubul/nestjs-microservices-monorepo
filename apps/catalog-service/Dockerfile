# syntax=docker/dockerfile:1.7
#
# Dockerfile for the "catalog-service" NestJS service.
# Build it from the REPOSITORY ROOT so the whole pnpm/turbo workspace is the build context:
#   docker build -f apps/catalog-service/Dockerfile -t catalog-service .
#
# Stages: base -> pruner -> builder -> runner

ARG NODE_VERSION=24-slim
ARG TURBO_VERSION=2.11.7
# The workspace package (app) this image packages.
ARG APP=catalog-service

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
# then copy the pruned sources and compile the app.
FROM base AS builder
ARG APP
COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=${APP}

# ------------------------------------------------------------------ runner
# Slim production image: built output + runtime deps only, running as non-root.
FROM node:${NODE_VERSION} AS runner
ARG APP
ENV NODE_ENV=production
# APP must be a runtime env var so the CMD below can expand it.
ENV APP=${APP}
WORKDIR /app
COPY --from=builder --chown=node:node /app ./
# The Node image already provides a non-root "node" user.
USER node
CMD ["sh", "-c", "exec node apps/${APP}/dist/main.js"]
