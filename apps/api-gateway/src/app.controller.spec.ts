import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('advertises the gateway routing table', () => {
      const info = appController.getInfo();

      expect(info.service).toBe('api-gateway');
      expect(info.routes).toEqual(
        expect.arrayContaining([
          { path: '/api/products', service: 'catalog' },
          { path: '/api/orders', service: 'orders' },
        ]),
      );
    });
  });
});
