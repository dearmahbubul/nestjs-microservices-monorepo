import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
} from 'typeorm';

/**
 * A reservation already applied for a given event.
 *
 * RabbitMQ delivers at least once, and a redelivered `order.created` must not
 * take a second bite out of stock. Recording the event id inside the same
 * transaction as the decrement makes "has this been applied?" and "apply it"
 * a single atomic step — the `@PrimaryColumn` is what makes the insert fail
 * on a duplicate rather than relying on a separate read that could race.
 */
@Entity('order_placements')
export class OrderPlacement {
  /** The originating `OrderCreatedEvent.eventId`. */
  @PrimaryColumn('uuid')
  eventId!: string;

  @Column('uuid')
  orderId!: string;

  /** Total units reserved by this event, for reporting. */
  @Column('int')
  unitsReserved!: number;

  @CreateDateColumn()
  appliedAt!: Date;
}
