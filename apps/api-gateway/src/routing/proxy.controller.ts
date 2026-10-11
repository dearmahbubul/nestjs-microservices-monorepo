import { All, Controller, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthGuard } from './auth.guard.js';
import { ProxyService } from './proxy.service.js';
import {
  SERVICE_NAMES,
  resolveServiceForPath,
  type ServiceName,
} from './service-registry.js';

@Controller()
@UseGuards(AuthGuard)
export class ProxyController {
  constructor(private readonly proxy: ProxyService) {}

  /**
   * Catch-all reverse proxy. Nest registers `@All('{*path}')` at the router's
   * tail, so the health and root controllers declared elsewhere still win.
   *
   * The braces are load-bearing. On Express 5 / path-to-regexp v8 an unnamed
   * `*` is rejected, and the obvious replacement `*path` is *not* equivalent:
   * it requires at least one further segment, so a single-segment request like
   * `/products` falls through to Express's own 404 and this handler never runs.
   * `{*path}` keeps the wildcard optional and matches zero or more segments.
   *
   * Only the first path segment selects the service — the rest of the path is
   * forwarded untouched, so the gateway needs zero knowledge of downstream
   * route shapes.
   */
  @All('{*path}')
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    const service = resolveServiceForPath(req.originalUrl);
    if (!service || !SERVICE_NAMES.includes(service)) {
      res.status(404).json({
        statusCode: 404,
        error: 'Not Found',
        message: `No route configured for '${req.originalUrl}'`,
        availablePrefixes: SERVICE_NAMES,
      });
      return;
    }
    await this.proxy.forward(service satisfies ServiceName, req, res);
  }
}
