import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { ClientRequest } from 'node:http';
import {
  createProxyMiddleware,
  type RequestHandler,
} from 'http-proxy-middleware';
import type { AppConfig } from '../config/configuration.js';
import type { AuthenticatedRequest } from './auth.guard.js';
import type { ServiceName } from './service-registry.js';

/** Socket errors that mean "the service could not be reached at all". */
const CONNECT_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
]);

/**
 * Query parameters the gateway owns: whatever the client sends under these
 * names is discarded and replaced with the authenticated value.
 *
 * This is the whole reason order history is readable at all without a fat
 * security hole. `orders-service` filters orders by `customerEmail`, and the
 * only trustworthy source for that is the token — so `?customerEmail=` is
 * never a filter, it is a request that the gateway answers on the client's
 * behalf. Deleting first and appending second matters: passing the client's
 * value through and adding a second one would leave the service to pick, and
 * `URLSearchParams.get` picks the first.
 */
const GATEWAY_OWNED_PARAMS = ['customerEmail'] as const;

/**
 * Prefixes holding a body field the gateway owns.
 *
 * `customerEmail` is trusted in two places, not one: `orders-service` reads it
 * off the query to *list* orders, and off the JSON body to *create* one
 * (`OrdersService.create` -> `dto.customerEmail`). The query rewrite above
 * cannot reach a body, so without this a signed-in customer could post
 * `{"customerEmail": "someone@else.com"}` and file an order into a stranger's
 * history — which is exactly the outcome scoping the reads was meant to
 * prevent. Both halves have to be rewritten for the invariant to hold: an order
 * is always filed under the session's email.
 *
 * Only these prefixes get their bodies parsed. Every other request stays a
 * pure stream, which is the property `bodyParser: false` in `main.ts` exists to
 * preserve.
 */
const BODY_SCOPED_PREFIXES = new Set(['orders']);

/**
 * A replacement body, stashed on the request for the `proxyReq` hook to write.
 *
 * The obvious place to hand this over is an extra argument to the handler, and
 * `httpxy` does consult `options.buffer` — but `http-proxy-middleware` builds
 * its own options object and calls `this.proxy.web(req, res, activeProxyOptions)`
 * with exactly three arguments, so anything passed from here is dropped before
 * it can be seen. Verified in the installed 4.2.0, not assumed.
 *
 * The supported hook is `on.proxyReq`, which runs with the outgoing
 * `ClientRequest` in hand. That is where the body below is written.
 */
const SCOPED_BODY = Symbol('scopedBody');

type ScopedRequest = Request & { [SCOPED_BODY]?: Buffer };

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);
  private readonly timeoutMs: number;
  private readonly proxies = new Map<ServiceName, RequestHandler>();

  constructor(private readonly config: ConfigService) {
    this.timeoutMs = this.config.getOrThrow<AppConfig['app']>('app').requestTimeoutMs;
  }

  /**
   * Buffers a replacement body when the request is an authenticated write to a
   * scoped prefix, then forwards. Everything else streams straight through.
   */
  async forward(service: ServiceName, req: Request, res: Response): Promise<void> {
    applyIdentityScope(req);
    const body = await scopedBody(req);
    if (body) {
      (req as ScopedRequest)[SCOPED_BODY] = body;
    }
    return this.proxyFor(service)(req, res);
  }

  /** One proxy per service, created lazily and reused for every request. */
  private proxyFor(service: ServiceName): RequestHandler {
    let proxy = this.proxies.get(service);
    if (!proxy) {
      const target = this.config.getOrThrow<AppConfig['services']>('services')[
        service
      ];
      proxy = createProxyMiddleware({
        target,
        changeOrigin: true,
        proxyTimeout: this.timeoutMs,
        on: {
          error: (error, _req, res) => {
            this.writeError(service, error, res as Response);
          },
          proxyReq: (proxyReq, req) => {
            writeScopedBody(proxyReq, req as ScopedRequest);
          },
        },
      });
      this.proxies.set(service, proxy);
    }
    return proxy;
  }

  private writeError(service: ServiceName, error: Error, res: Response): void {
    if (!res || typeof res.writeHead !== 'function') {
      return;
    }

    const detail = error.message;
    const { status, message } = this.describe(service, error);

    if (status === 503) {
      this.logger.warn(`${service} unreachable: ${detail}`);
    } else if (status === 504) {
      this.logger.warn(`${service} timed out after ${this.timeoutMs}ms`);
    } else {
      this.logger.error(`${service} request failed: ${detail}`);
    }

    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ statusCode: status, message }));
  }

  private describe(
    service: ServiceName,
    error: Error,
  ): { status: number; message: string } {
    if (isConnectError(error)) {
      return { status: 503, message: `${service} is unavailable` };
    }
    if (error.name === 'TimeoutError' || errorCode(error) === 'ETIMEDOUT') {
      return { status: 504, message: `${service} timed out` };
    }
    return { status: 502, message: `${service} request failed` };
  }
}

function errorCode(error: unknown): string | undefined {
  return (error as { code?: string }).code;
}

function isConnectError(error: unknown): boolean {
  const code = errorCode(error);
  return code !== undefined && CONNECT_ERROR_CODES.has(code);
}

/**
 * Rewrites the proxied URL so gateway-owned query parameters reflect the
 * authenticated caller rather than the client's request.
 *
 * Public requests are left alone: with no `auth` on the request there is no
 * identity to inject, and stripping the parameter would only turn a harmless
 * no-op into a silently different query. A protected route cannot reach here
 * without claims, because the guard runs first and rejects the request, so the
 * unauthenticated case is only ever a public route.
 *
 * The mutation is safe with respect to the proxy: `http-proxy-middleware`
 * reads `req.url` when it forwards, and this runs before the handler is
 * invoked. Note that `req.originalUrl` is *not* updated — that is deliberate,
 * so the guard and the 404 handler keep seeing what the client actually asked
 * for.
 */
function applyIdentityScope(req: Request): void {
  const claims = (req as AuthenticatedRequest).auth;
  if (!claims) {
    return;
  }

  const [pathname = '', search = ''] = (req.url ?? '').split('?');
  const params = new URLSearchParams(search);
  for (const name of GATEWAY_OWNED_PARAMS) {
    params.delete(name);
  }
  params.set('customerEmail', claims.email);

  const query = params.toString();
  req.url = query === '' ? pathname : `${pathname}?${query}`;
}

/**
 * Returns a replacement body buffer when the request is an authenticated write
 * to a scoped prefix, or `null` to leave the request stream alone.
 *
 * A no-op for everything else, so the common case still streams straight
 * through and `bodyParser: false` in `main.ts` keeps meaning what it says.
 *
 * The replacement is handed to the proxy as `options.buffer`, which
 * `httpxy` uses in place of `req` when piping the outgoing body
 * (`(options.buffer || req).pipe(proxyReq)`). That is the supported way in, and
 * it avoids mutating an Express request in place — which would mean swapping
 * the stream, the `content-length`, and the `content-encoding` mid-flight and
 * hoping nothing else had cached a reference to the original.
 *
 * A body that is absent, empty, or not a JSON object is forwarded untouched
 * rather than rejected: the service stays the authority on what a valid body
 * is, and the gateway only ever overwrites a field it owns.
 */
async function scopedBody(req: Request): Promise<Buffer | null> {
  const claims = (req as AuthenticatedRequest).auth;
  if (!claims) {
    return null;
  }

  const pathname = (req.url ?? '').split('?')[0] ?? '';
  const prefix = pathname.replace(/^\/+/, '').split('/')[0] ?? '';
  if (!BODY_SCOPED_PREFIXES.has(prefix)) {
    return null;
  }

  const raw = await readBody(req);
  if (raw === null || raw.trim() === '') {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  return Buffer.from(
    JSON.stringify({
      ...(parsed as Record<string, unknown>),
      customerEmail: claims.email,
    }),
    'utf8',
  );
}

/**
 * Writes the stashed replacement body to the outgoing request.
 *
 * `httpxy` has already wired `req.pipe(proxyReq)` before this hook runs, and
 * that pipe is still live — so simply ending the outgoing request and writing
 * the replacement races the pipe, which later writes its own chunk into a
 * closed stream and fails with `write after end`. The pipe has to be detached
 * first with `unpipe`, which is what actually cancels the original body
 * transfer; `end()` alone only marks the destination finished.
 *
 * Order: `req` is still flowing, so it is drained and destroyed to stop it
 * emitting, the outgoing request is unpiped, then the replacement is written
 * and closed. The outgoing `Content-Length` is corrected too, because a
 * rewritten JSON body is almost never the same size as the original and the
 * proxy copies the original header verbatim.
 *
 * A no-op unless `forward` stashed a body, so every other request on this
 * service keeps the untouched pass-through path.
 */
function writeScopedBody(proxyReq: ClientRequest, req: ScopedRequest): void {
  const body = req[SCOPED_BODY];
  if (!body) {
    return;
  }

  req.unpipe(proxyReq);
  req.resume();
  req.destroy();

  proxyReq.setHeader('content-length', String(body.byteLength));
  // The replacement is plain JSON, so any encoding the client claimed for the
  // bytes we just discarded no longer applies.
  proxyReq.removeHeader('content-encoding');

  proxyReq.end(body);
}

/**
 * Drains the request stream to a string, or `null` when there is nothing to
 * read.
 *
 * An `error` resolves to `null` rather than rejecting: a client that hung up
 * mid-body is not the gateway's problem to report, and letting it fail here
 * would turn a broken upload into a 500 from a component that only meant to
 * peek at a field.
 */
function readBody(req: Request): Promise<string | null> {
  if (req.readableEnded) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(null));
  });
}
