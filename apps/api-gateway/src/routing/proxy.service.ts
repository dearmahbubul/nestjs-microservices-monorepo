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

// Socket errors that mean "the service could not be reached at all".
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

// Query parameters the gateway owns: whatever the client sends under these
// names is discarded and replaced with the authenticated value.
const GATEWAY_OWNED_PARAMS = ['customerEmail'] as const;

// Prefixes holding a body field the gateway owns. `customerEmail` is trusted
// in two places: the query (orders list) and the body (orders create).
const BODY_SCOPED_PREFIXES = new Set(['orders']);

// Stash for the replacement body, handed to the proxy via `on.proxyReq`
// (http-proxy-middleware builds its own options object, so an extra handler
// argument never reaches httpxy — verified in the installed 4.2.0).
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

  async forward(service: ServiceName, req: Request, res: Response): Promise<void> {
    applyIdentityScope(req);
    const body = await scopedBody(req);
    if (body) {
      (req as ScopedRequest)[SCOPED_BODY] = body;
    }
    return this.proxyFor(service)(req, res);
  }

  // One proxy per service, created lazily and reused for every request.
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

// Rewrites the proxied URL so gateway-owned query parameters reflect the
// authenticated caller. Public requests are left alone: no `auth` means no
// identity to inject. `req.originalUrl` is deliberately NOT updated, so the
// guard and the 404 handler keep seeing what the client asked for.
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

// Replacement body buffer for an authenticated write to a scoped prefix, or
// null to leave the request stream alone. A body that is absent, empty, or not
// a JSON object is forwarded untouched — the service stays the authority on
// what a valid body is, and the gateway only overwrites a field it owns.
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

// Writes the stashed replacement body to the outgoing request. httpxy has
// already wired req.pipe(proxyReq), so the pipe must be detached first
// (`unpipe`) or the original body later writes into a closed stream. The
// outgoing Content-Length is corrected too — a rewritten body is almost never
// the same size as the original.
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
  // discarded bytes no longer applies.
  proxyReq.removeHeader('content-encoding');

  proxyReq.end(body);
}

// Drains the request stream to a string, or null when there is nothing to
// read. An `error` resolves to null: a client that hung up mid-body is not
// the gateway's problem to report.
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
