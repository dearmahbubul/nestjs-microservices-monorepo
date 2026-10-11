import {
  BadRequestException,
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

/** Argon2id parameters. `type` is explicit so a future default change can't move us. */
const HASH_OPTIONS = { type: argon2.argon2id } as const;

/** Emails are compared case-insensitively; the column stores the normal form. */
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

  /**
   * Exchanges credentials for a token.
   *
   * A wrong password and an unknown account produce the *same* error and take
   * the *same* time — see `burnPasswordCheck`. Anything else lets an attacker
   * enumerate who has an account.
   */
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

    const token = await this.jwt.signAsync(
      { sub: user.id, email: user.email, role: user.role },
      { expiresIn: this.ttlSeconds },
    );

    this.logger.log(`Issued a token for ${user.email}`);
    return { token, user: toAuthUser(user) };
  }

  /**
   * Resolves the user behind a token.
   *
   * The gateway already verified the token before forwarding, but this service
   * verifies it again rather than trusting the hop: `identity-service` is
   * reachable on the compose network without going through the gateway, and a
   * service that only checks auth when proxied is not actually protected.
   */
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

  /**
   * Creates the admin account from configuration if it is absent.
   *
   * Never rotates an existing password: `AUTH_ADMIN_PASSWORD` seeds the account
   * once, and afterwards the database is the source of truth. A mismatch is
   * logged loudly rather than silently overwriting a password someone changed
   * on purpose.
   */
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

  /**
   * `passwordHash` is `select: false` on the entity, so it never rides along on
   * an ordinary `find()`. The two places that genuinely need it ask here.
   */
  private findWithHash(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();
  }

  /**
   * Does the same work as a real verify when the account does not exist, so the
   * response time for "no such user" matches "wrong password". Without this the
   * fast path is a timing oracle that enumerates accounts.
   */
  private async burnPasswordCheck(password: string): Promise<void> {
    this.decoyHash ??= await argon2.hash('decoy-password', HASH_OPTIONS);
    await argon2.verify(this.decoyHash, password).catch(() => false);
  }
}
