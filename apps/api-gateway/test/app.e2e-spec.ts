import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createServer, type Server } from 'node:http';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

/**
 * Boots the real gateway against a throwaway HTTP server standing in for
 * catalog-service. This proves the proxy path end to end — path rewriting,
 * status and body passthrough, query preservation — without needing the rest
 * of the stack running.
 */
describe('api-gateway (e2e)', () => {
  let app: INestApplication<App>;
  let downstream: Server;
  let baseUrl: string;
  const seen: Array<{ url: string; method: string }> = [];

  beforeAll(async () => {
    downstream = createServer((req, res) => {
      const url = req.url ?? '';
      seen.push({ url, method: req.method ?? '' });

      // Compare pathname only: the query string must reach the downstream,
      // but it should not affect which handler answers.
      const pathname = url.split('?')[0];

      // The gateway's readiness probe calls GET /health on every downstream.
      if (pathname === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      if (pathname === '/products') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify([{ id: '1', name: 'Widget' }]));
        return;
      }
      if (pathname === '/products/42') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id: '42', name: 'Answer' }));
        return;
      }
      if (pathname.startsWith('/products/missing')) {
        res.writeHead(404, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ message: 'Product missing not found' }));
        return;
      }
      // Reached via POST /products/echo -> proxied to /products/echo.
      if (pathname === '/products/echo' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          res.writeHead(201, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ received: body }));
        });
        return;
      }

      res.writeHead(404).end();
    });

    await new Promise<void>((resolve) => downstream.listen(0, resolve));
    const address = downstream.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;

    // Point every downstream at the stub before the module reads its config.
    process.env.CATALOG_SERVICE_URL = baseUrl;
    process.env.IDENTITY_SERVICE_URL = baseUrl;
    process.env.NOTIFICATIONS_SERVICE_URL = baseUrl;
    // A closed high port that undici will genuinely attempt to connect to.
    // (Low ports like 1 are rejected as "bad port" before any connection, so
    // they would not exercise the unreachable-downstream path.)
    process.env.ORDERS_SERVICE_URL = 'http://127.0.0.1:49999';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await new Promise<void>((resolve, reject) =>
      downstream.close((err) => (err ? reject(err) : resolve())),
    );
  });

  beforeEach(() => {
    seen.length = 0;
  });

  it('exposes gateway metadata at the root', async () => {
    const res = await request(app.getHttpServer()).get('/').expect(200);

    expect(res.body.service).toBe('api-gateway');
    expect(res.body.routes).toBeInstanceOf(Array);
  });

  it('reports liveness without touching downstreams', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.body.status).toBe('ok');
    expect(seen).toHaveLength(0);
  });

  it('reports readiness and probes each downstream', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/ready')
      .expect(200);

    expect(Object.keys(res.body.downstreams).sort()).toEqual([
      'catalog',
      'identity',
      'notifications',
      'orders',
    ]);

    // The stub-backed services answer; the deliberately dead one does not,
    // and that must surface as overall "degraded".
    expect(res.body.downstreams.catalog.status).toBe('up');
    expect(res.body.downstreams.orders.status).toBe('down');
    expect(res.body.status).toBe('degraded');
  });

  it('proxies GET with the path preserved', async () => {
    const res = await request(app.getHttpServer())
      .get('/products')
      .expect(200);

    expect(res.body).toEqual([{ id: '1', name: 'Widget' }]);
    expect(seen).toContainEqual({ url: '/products', method: 'GET' });
  });

  it('preserves query strings and path parameters', async () => {
    await request(app.getHttpServer())
      .get('/products/42?expand=images')
      .expect(200);

    expect(seen).toContainEqual({
      url: '/products/42?expand=images',
      method: 'GET',
    });
  });

  it('forwards the downstream status and body on 4xx', async () => {
    const res = await request(app.getHttpServer())
      .get('/products/missing')
      .expect(404);

    expect(res.body.message).toContain('not found');
  });

  it('streams a request body to the downstream', async () => {
    const res = await request(app.getHttpServer())
      .post('/products/echo')
      .send({ name: 'New' })
      .expect(201);

    expect(res.body.received).toContain('New');
  });

  it('returns 404 for a path with no configured route', async () => {
    const res = await request(app.getHttpServer())
      .get('/definitely-not-a-route')
      .expect(404);

    expect(res.body.message).toContain('No route configured');
    expect(seen).toHaveLength(0);
  });

  it('maps an unreachable downstream to 503', async () => {
    // orders-service is pointed at a closed port in beforeAll; config is read
    // once at boot, so the env cannot be swapped per-test.
    const res = await request(app.getHttpServer())
      .get('/orders')
      .expect(503);

    expect(res.body.message).toContain('unavailable');
  });
});
