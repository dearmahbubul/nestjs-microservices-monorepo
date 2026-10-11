import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  @Column('numeric', { precision: 10, scale: 2, default: 0 })
  price!: string;

  /**
   * Units on hand. Decremented by stock reservation; never allowed to go
   * negative (enforced by the `stock >= 0` CHECK-style guard in
   * `ProductsService.reserveStock`, which locks the row first).
   */
  @Column('int', { default: 0 })
  stock!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
