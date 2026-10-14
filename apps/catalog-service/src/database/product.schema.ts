import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { randomUUID } from 'node:crypto';

@Schema({
  collection: 'products',
  timestamps: true,
  toJSON: { virtuals: true, versionKey: false },
})
export class Product {
  @Prop({ type: String, default: () => randomUUID() })
  _id!: string;

  @Prop({ required: true, trim: true })
  name!: string;

  /** Decimal string, e.g. "129.99" — never a float. */
  @Prop({ required: true })
  price!: string;

  @Prop({ default: 0, min: 0 })
  stock!: number;

  createdAt!: Date;
  updatedAt!: Date;

  /** Serialised as `id` so the wire shape matches the other services. */
  id!: string;
}

export const ProductSchema = SchemaFactory.createForClass<Product>(Product);
ProductSchema.virtual('id').get(function (this: { _id: string }) {
  return this._id;
});
