import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { UserRole } from '@repo/contracts';

// An account that can sign in. `email` is stored already normalised
// (trimmed, lower-cased) and unique, so `Admin@Example.com` and
// `admin@example.com` cannot both exist.
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  // Argon2id hash, never the password. `select: false` keeps it out of every
  // ordinary find() — a caller that needs it has to ask explicitly.
  @Column({ select: false })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 32, default: 'admin' })
  role!: UserRole;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
