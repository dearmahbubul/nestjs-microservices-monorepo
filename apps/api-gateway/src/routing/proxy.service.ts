import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Readable } from 'node:stream';
import type { AppConfig } from '../config/configuration.js';
import type { ServiceName } from './service-registry.js';

/** Structural type for a fetch Response (Node's global fetch / undici). */
type UpstreamResponse = Awaited<ReturnType<typeof fetch>>;

/** Headers that must not be forwarded between hops (RFC 7230 hop-by-hop). */
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  // Let fetch recompute these for the downstream connection.
  'host',
  'content-length',
]);

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.timeoutMs = this.config.getOrThrow<AppConfig['app']>('app').requestTimeoutMs;
  }

  /**
   * Forwards `req` to `service` and streams the reply back into `res`.
   *
   * Errors are translated to gateway semantics: the downstream status is
   * preserved for real HTTP errors (4xx/5xx are the app's answer, not ours),
   * while transport failures become 502/503/504 so callers can tell "the
   * service said no" apart from "the service never answered".
   */
  async forward(
    service: ServiceName,
    req: Request,
    res: Response,
  ): Promise<void> {
    const baseUrl = this.config.getOrThrow<AppConfig['services']>('services')[
      service
    ];
    const target = this.buildTargetUrl(baseUrl, req);

    if (!target) {
      throw new BadGatewayException(
        `Refusing to proxy to '${service}': URL path escapes the service origin`,
      );
    }

    // Nothing useful can be forwarded for a socket that already hung up.
    if (req.aborted) {
      return;
    }

    let upstream: UpstreamResponse;
    try {
      upstream = await this.send(target, req);
    } catch (error) {
      throw this.toGatewayError(service, error);
    }
    this.writeResponse(upstream, res);
  }

  private buildTargetUrl(baseUrl: string, req: Request): string | undefined {
    const path = req.originalUrl.startsWith('/')
      ? req.originalUrl.slice(1)
      : req.originalUrl;
    const url = new URL(path, `${baseUrl}/`);

    // Path traversal guard: the resolved URL must stay on the service origin.
    if (url.origin !== new URL(baseUrl).origin) {
      return undefined;
    }
    return url.toString();
  }

  private async send(target: string, req: Request): Promise<UpstreamResponse> {
    const body = this.buildBody(req);
    return fetch(target, {
      method: req.method,
      headers: this.buildHeaders(req),
      body,
      redirect: 'manual',
      // Required by undici whenever the body is a stream: it tells the client
      // the request is not a duplex conversation. Omitting it throws a
      // TypeError that has nothing to do with connectivity.
      ...(body ? { duplex: 'half' as const } : {}),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
  }

  private buildHeaders(req: Request): Headers {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined || HOP_BY_HOP.has(key.toLowerCase())) {
        continue;
      }
      headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }
    return headers;
  }

  /**
   * GET/HEAD/OPTIONS have no body. For everything else we hand undici a
   * web ReadableStream. A request that already failed mid-body would throw on
   * read, so failures surface as a gateway error rather than a hung socket.
   */
  private buildBody(req: Request): BodyInit | undefined {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return undefined;
    }
    // undici accepts a Node Readable at runtime; the DOM lib's BodyInit type
    // does not declare it, so the cast is confined to this one line.
    return Readable.toWeb(req) as unknown as BodyInit;
  }

  private writeResponse(upstream: UpstreamResponse, res: Response): void {
    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (HOP_BY_HOP.has(key.toLowerCase())) {
        return;
      }
      // setHeader throws on malformed names, so a bad downstream header
      // degrades to "not forwarded" rather than a 500 for the whole request.
      try {
        res.setHeader(key, value);
      } catch {
        /* skip invalid header */
      }
    });

    if (!upstream.body) {
      res.end();
      return;
    }
    // Same lib-boundary cast as buildBody: undici's web stream is compatible
    // with Node's at runtime, the declarations just disagree on the view type.
    Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]).pipe(
      res,
    );
  }

  private toGatewayError(service: ServiceName, error: unknown): HttpException {
    const detail = error instanceof Error ? error.message : String(error);

    if (error instanceof Error && error.name === 'TimeoutError') {
      this.logger.warn(`${service} timed out after ${this.timeoutMs}ms`);
      return new GatewayTimeoutException(`${service} timed out`);
    }

    if (isConnectError(error)) {
      this.logger.warn(`${service} unreachable: ${detail}`);
      return new ServiceUnavailableException(`${service} is unavailable`);
    }

    this.logger.error(`${service} request failed: ${detail}`);
    return new BadGatewayException(`${service} request failed`);
  }
}

/** Node/undici socket error codes that mean "could not reach the service". */
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
 * undici reports every transport failure as `TypeError: fetch failed` with the
 * real reason on `cause`. Checking the code (rather than the error name) keeps
 * programming errors — a bad option, a malformed header — out of the "service
 * is down" bucket, so they surface as 502 instead of a misleading 503.
 */
function isConnectError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const cause = (error as { cause?: { code?: string } }).cause;
  return cause?.code !== undefined && CONNECT_ERROR_CODES.has(cause.code);
}
