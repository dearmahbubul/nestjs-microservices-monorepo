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
import { Product } from '../database/product.schema.js';
import type { CreateProductDto, UpdateProductDto } from './dto/product.dto.js';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  // `limit` and `offset` are independent; passing neither returns the whole
  // catalog, which is what the admin panel and the seed scripts call.
  @Get()
  findAll(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<Product[]> {
    return this.products.findAll(parsePage(limit, offset));
  }

  // Declared before `:id` so Express matches the literal first; otherwise
  // "count" would be read as a product id.
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
