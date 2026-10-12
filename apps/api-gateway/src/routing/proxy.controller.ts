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
   * Catch-all reverse proxy. The first path segment selects the service; the
   * rest of the path is forwarded untouched. `{*path}` (not `*path`) keeps the
   * wildcard optional on Express 5, so single-segment paths like `/products`
   * also match.
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
