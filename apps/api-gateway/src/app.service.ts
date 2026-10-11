import { Injectable } from '@nestjs/common';
import { ROUTE_TO_SERVICE } from './routing/service-registry.js';

@Injectable()
export class AppService {
  getInfo() {
    return {
      service: 'api-gateway',
      description: 'Public HTTP entry point for the microservices.',
      routes: ROUTE_TO_SERVICE.map(({ prefix, service }) => ({
        path: `/api/${prefix}`,
        service,
      })),
      health: '/health',
      readiness: '/health/ready',
    };
  }
}
