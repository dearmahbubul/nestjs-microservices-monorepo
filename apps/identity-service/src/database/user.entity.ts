import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { UserRole } from '@repo/contracts';

/**
 * An account that can sign in.
 *
 * `email` is stored already normalised (trimmed, lower-cased) — uniqueness is
 * enforced by the column, so `Admin@Example.com` and `admin@example.com` must
 * not both be insertable. Normalisation happens in `AuthService`, not here, so
 * the rule lives in one place.
 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  /**
   * An Argon2id hash, never the password. `select: false` keeps it out of
   * every ordinary `find()` — a caller that needs it has to ask for it
   * explicitly, which makes an accidental leak into an API response much
   * harder.
   */
  @Column({ select: false })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 32, default: 'admin' })
  role!: UserRole;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
