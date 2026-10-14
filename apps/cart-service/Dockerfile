# syntax=docker/dockerfile:1.7
#
# Dockerfile for the "cart-service" NestJS service.
# Build it from the REPOSITORY ROOT so the whole pnpm/turbo workspace is the build context:
#   docker build -f apps/cart-service/Dockerfile -t cart-service .
#
# Stages: base -> pruner -> builder -> runner

ARG NODE_VERSION=24-slim
ARG TURBO_VERSION=2.11.7
# The workspace package (app) this image packages.
ARG APP=cart-service

# ------------------------------------------------------------------ base
FROM node:${NODE_VERSION} AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# ------------------------------------------------------------------ pruner
# turbo prune carves out the minimal part of the monorepo for this app.
FROM base AS pruner
ARG APP
ARG TURBO_VERSION
RUN npm install -g turbo@${TURBO_VERSION}
COPY . .
RUN turbo prune --scope=${APP} --docker

# ------------------------------------------------------------------ builder
FROM base AS builder
ARG APP
COPY --from=pruner /app/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=${APP}

# ------------------------------------------------------------------ runner
FROM node:${NODE_VERSION} AS runner
ARG APP
ENV NODE_ENV=production
ENV APP=${APP}
WORKDIR /app
COPY --from=builder --chown=node:node /app ./
USER node
CMD ["sh", "-c", "exec node apps/${APP}/dist/main.js"]
