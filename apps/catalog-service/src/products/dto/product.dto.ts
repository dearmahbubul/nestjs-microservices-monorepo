/** Write-side product contracts, validated by hand in `ProductsService`. */
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
