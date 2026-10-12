import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ProductsService } from './products.service.js';
import { parsePage } from './pagination.js';
import { Product } from '../database/product.entity.js';
import type { CreateProductDto, UpdateProductDto } from './dto/product.dto.js';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  /**
   * `GET /products` — the catalog, optionally a page of it.
   *
   * `limit` and `offset` are independent: `?offset=48` with no `limit` is
   * "everything from the 49th", which is exactly what an infinite scroll wants
   * for its last page, and `?limit=12` with no `offset` is "the first page".
   * Passing neither returns the whole catalog, so existing callers are
   * unaffected.
   */
  @Get()
  findAll(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<Product[]> {
    return this.products.findAll(parsePage(limit, offset));
  }

  /**
   * `GET /products/count` — how many rows pagination is counting against.
   *
   * Declared before `:id` so Express matches the literal first; otherwise
   * "count" would be read as a product id and 404 as an unknown uuid.
   */
  @Get('count')
  async count(): Promise<{ count: number }> {
    return { count: await this.products.count() };
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.products.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.products.remove(id);
  }
}
