import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** Service discovery for humans: what this gateway fronts. */
  @Get()
  getInfo() {
    return this.appService.getInfo();
  }
}
