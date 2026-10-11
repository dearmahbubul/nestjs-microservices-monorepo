/**
 * Write-side product contracts.
 *
 * Plain interfaces validated by hand in `ProductsService`, the same convention
 * `orders-service` uses for `CreateOrderDto`: the repo does not depend on
 * class-validator, so a shape that needs checking gets an explicit validator
 * with a readable error instead of a decorator that silently no-ops when the
 * pipe is not wired up.
 */

export interface CreateProductDto {
  name: string;
  /** Decimal amount; accepted as a string ("129.99") or a number. */
  price: number | string;
  /** Units on hand. Optional; defaults to 0. */
  stock?: number;
}

export interface UpdateProductDto {
  name?: string;
  price?: number | string;
  stock?: number;
}
