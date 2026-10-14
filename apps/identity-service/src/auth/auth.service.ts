import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import type { AuthUser, LoginResponse, TokenClaims } from '@repo/contracts';
import { User } from '../database/user.entity.js';
import type { AppConfig } from '../config/configuration.js';
import type { RegisterDto } from './dto/register.dto.js';

const HASH_OPTIONS = { type: argon2.argon2id } as const;
const MIN_PASSWORD_LENGTH = 8;
// Deliberately permissive: one @, a dot in the domain, nothing else.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Emails are compared case-insensitively; the column stores the normal form.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toAuthUser(user: User): AuthUser {
  return { id: user.id, email: user.email, role: user.role };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly ttlSeconds: number;
  private readonly adminEmail: string;
  private readonly adminPassword: string;

  /** Built once, on the first failed lookup — see `burnPasswordCheck`. */
  private decoyHash?: string;

  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    const auth = config.getOrThrow<AppConfig['auth']>('auth');
    this.ttlSeconds = auth.tokenTtlSeconds;
    this.adminEmail = auth.adminEmail;
    this.adminPassword = auth.adminPassword;
  }

  // A wrong password and an unknown account produce the *same* error and take
  // the *same* time — anything else lets an attacker enumerate accounts.
  async login(email: unknown, password: unknown): Promise<LoginResponse> {
    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      email.trim() === '' ||
      password === ''
    ) {
      throw new BadRequestException('email and password are required');
    }

    const user = await this.findWithHash(normalizeEmail(email));

    if (!user) {
      await this.burnPasswordCheck(password);
      throw new UnauthorizedException('Invalid email or password');
    }

    const valid = await argon2
      .verify(user.passwordHash, password)
      .catch(() => false);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = await this.issueToken(user);

    this.logger.log(`Issued a token for ${user.email}`);
    return { token, user: toAuthUser(user) };
  }

  // Creates a `customer` account and signs it in. The role is hard-coded: a
  // caller-supplied role would be privilege escalation with extra steps.
  async register(dto: RegisterDto): Promise<LoginResponse> {
    const email = this.validatedEmail(dto?.email);
    const password = this.validatedPassword(dto?.password);

    // Hash before the existence check so a duplicate and a fresh address cost
    // roughly the same.
    const passwordHash = await argon2.hash(password, HASH_OPTIONS);

    try {
      // One insert; the unique index on `email` decides.
      const user = await this.users.save(
        this.users.create({ email, passwordHash, role: 'customer' }),
      );
      this.logger.log(`Registered customer ${user.email}`);
      return { token: await this.issueToken(user), user: toAuthUser(user) };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('That email is already registered');
      }
      throw error;
    }
  }

  /** The single place a token is minted, so claims cannot drift between flows. */
  private issueToken(user: User): Promise<string> {
    return this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      { expiresIn: this.ttlSeconds },
    );
  }

  private validatedEmail(value: unknown): string {
    if (typeof value !== 'string' || !EMAIL_PATTERN.test(value.trim())) {
      throw new BadRequestException('a valid email is required');
    }
    return normalizeEmail(value);
  }

  private validatedPassword(value: unknown): string {
    if (typeof value !== 'string' || value.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      );
    }
    return value;
  }

  // The gateway already verified the token before forwarding; this service
  // verifies again rather than trusting the hop, since it is reachable on the
  // compose network without going through the gateway.
  async currentUser(token: string): Promise<AuthUser> {
    let claims: TokenClaims;
    try {
      claims = await this.jwt.verifyAsync<TokenClaims>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user = await this.users.findOne({ where: { id: claims.sub } });
    if (!user) {
      // A valid signature for a deleted account: the token outlived the user.
      throw new UnauthorizedException('Account no longer exists');
    }
    return toAuthUser(user);
  }

  // Creates the admin account from configuration if it is absent. Never
  // rotates an existing password: after seeding, the database is the source
  // of truth.
  async seed(): Promise<number> {
    const email = normalizeEmail(this.adminEmail);
    const existing = await this.findWithHash(email);

    if (existing) {
      const matches = await argon2
        .verify(existing.passwordHash, this.adminPassword)
        .catch(() => false);
      if (matches) {
        this.logger.log(`Admin account ${email} already present, skipping seed`);
      } else {
        this.logger.warn(
          `Admin ${email} exists but AUTH_ADMIN_PASSWORD no longer matches it — leaving the stored password unchanged`,
        );
      }
      return 0;
    }

    const passwordHash = await argon2.hash(this.adminPassword, HASH_OPTIONS);
    await this.users.save(
      this.users.create({ email, passwordHash, role: 'admin' }),
    );
    this.logger.log(`Seeded admin account ${email}`);
    return 1;
  }

  // `passwordHash` is `select: false` on the entity, so it never rides along
  // on an ordinary find(); the two places that need it ask here.
  private findWithHash(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();
  }

  // Same work as a real verify when the account does not exist, so the
  // response time for "no such user" matches "wrong password".
  private async burnPasswordCheck(password: string): Promise<void> {
    this.decoyHash ??= await argon2.hash('decoy-password', HASH_OPTIONS);
    await argon2.verify(this.decoyHash, password).catch(() => false);
  }
}

// Did this insert collide with the unique index on `email`? Checked
// structurally rather than by instanceof. Postgres reports 23505; SQLite
// reports SQLITE_CONSTRAINT_UNIQUE in the message.
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const { code, driverError, message } = error as {
    code?: unknown;
    driverError?: { code?: unknown };
    message?: unknown;
  };
  const codes = [code, driverError?.code];
  if (codes.includes('23505')) {
    return true;
  }
  return (
    typeof message === 'string' && message.includes('SQLITE_CONSTRAINT_UNIQUE')
  );
}
