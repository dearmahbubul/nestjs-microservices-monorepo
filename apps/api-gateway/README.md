# api-gateway

The single public HTTP entry point for the microservices in this monorepo.
It owns no business logic and no data — it terminates client HTTP, forwards
requests to the right downstream service, and exposes health/readiness.

## What it does

- **Reverse proxy.** A single catch-all route maps the first path segment to a
  service and forwards the rest of the path untouched, so the gateway needs no
  knowledge of downstream route shapes.
- **Health.** `GET /health` is liveness (cheap, never depends on downstreams);
  `GET /health/ready` probes every downstream concurrently and reports
  per-dependency status.

## Routing table

| Public path        | Service               |
| ------------------ | --------------------- |
| `/products/*`      | catalog-service       |
| `/auth/*`          | identity-service      |
| `/users/*`         | identity-service      |
| `/orders/*`        | orders-service        |
| `/notifications/*` | notifications-service |

The mapping lives in one place: `src/routing/service-registry.ts`. Adding a
service is one line there plus its URL in the environment — the proxy logic
does not change. Behind nginx these are reachable under `/api/*`.

## Error semantics

Transport failures are distinguished from application answers, so a caller can
tell "the service said no" from "the service never answered":

| Situation                    | Response                  |
| ---------------------------- | ------------------------- |
| Downstream 4xx/5xx           | Passed through unchanged  |
| Downstream unreachable       | `503 Service Unavailable` |
| Downstream exceeds timeout   | `504 Gateway Timeout`     |
| Any other downstream failure | `502 Bad Gateway`         |
| No route configured          | `404 Not Found`           |

## Configuration

| Variable                    | Default                 | Notes                                           |
| --------------------------- | ----------------------- | ----------------------------------------------- |
| `PORT`                      | `4000`                  | The gateway's own port; internal services keep `3000`. |
| `REQUEST_TIMEOUT_MS`        | `10000`                 | Global timeout for every proxied request.        |
| `CATALOG_SERVICE_URL`       | `http://localhost:3000` |                                                  |
| `IDENTITY_SERVICE_URL`      | `http://localhost:3000` |                                                  |
| `ORDERS_SERVICE_URL`        | `http://localhost:3000` |                                                  |
| `NOTIFICATIONS_SERVICE_URL` | `http://localhost:3000` |                                                  |

Invalid values fail fast at boot rather than surfacing as a confusing runtime
error. See `.env.example` for the docker-compose network names.

## Run

```bash
pnpm --filter api-gateway dev      # watch mode
pnpm --filter api-gateway test     # unit tests
pnpm --filter api-gateway test:e2e # e2e, spins up a stub downstream
```

## Notes for future work

Deliberately not included, to keep this simple. Add when a requirement appears:

- **Auth.** Today any downstream that needs it validates its own token. When
  several do, verifying once here and forwarding a trusted identity header
  avoids repeating the check.
- **Rate limiting** (`@nestjs/throttler`) and **retries/circuit breaking** for
  flaky downstreams. `trust proxy` is already set, so client IPs are real.
- **Correlation IDs** propagated as `x-request-id` across the hop.
