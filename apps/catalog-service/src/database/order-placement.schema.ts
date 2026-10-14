import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

// One document per already-applied reservation event. The unique index on
// eventId is what makes a concurrent duplicate fail instead of double-reserving.
@Schema({
  collection: 'order_placements',
  timestamps: true,
  toJSON: { virtuals: true, versionKey: false },
})
export class OrderPlacement {
  @Prop({ type: String, required: true, unique: true })
  eventId!: string;

  @Prop({ required: true })
  orderId!: string;

  @Prop({ required: true })
  unitsReserved!: number;

  createdAt!: Date;
}

export const OrderPlacementSchema =
  SchemaFactory.createForClass<OrderPlacement>(OrderPlacement);
