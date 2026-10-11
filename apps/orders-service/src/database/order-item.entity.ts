import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Order } from './order.entity.js';

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('uuid')
  orderId!: string;

  @Column('uuid')
  productId!: string;

  @Column()
  name!: string;

  @Column('numeric', { precision: 10, scale: 2 })
  unitPrice!: string;

  @Column('int')
  quantity!: number;

  @Column('numeric', { precision: 10, scale: 2 })
  lineTotal!: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order!: Relation<Order>;
}
