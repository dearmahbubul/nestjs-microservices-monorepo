export interface CreateOrderItemDto {
  productId: string;
  name: string;
  unitPrice: number | string;
  quantity: number;
}

export interface CreateOrderDto {
  customerEmail: string;
  items: CreateOrderItemDto[];
}
