import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

export interface CartItem {
  productId: string;
  quantity: number;
}

// One cart per customer, all lines in a single document: reading the cart is
// one query, updating a line is one update.
@Schema({
  collection: 'carts',
  timestamps: true,
  toJSON: { virtuals: true, versionKey: false },
})
export class Cart {
  @Prop({ required: true, unique: true, trim: true })
  customerEmail!: string;

  @Prop({
    type: [
      {
        _id: false,
        productId: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },
      },
    ],
    default: [],
  })
  items!: CartItem[];

  createdAt!: Date;
  updatedAt!: Date;
}

export const CartSchema = SchemaFactory.createForClass<Cart>(Cart);
// One line per product per cart, enforced by the database.
CartSchema.index(
  { customerEmail: 1, 'items.productId': 1 },
  { unique: true },
);
