import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as argon2 from 'argon2';
import { User } from '../database/user.entity.js';
import { AuthService } from './auth.service.js';

/**
 * The login path is the one piece of security-critical logic in this service:
 * it must hand a token to the right password and refuse everything else, and it
 * must not reveal which of "unknown email" and "wrong password" happened.
 *
 * Argon2 runs for real — the hashing is the thing under test, so faking it
 * would test nothing. Only the repository and the JWT service are faked.
 */
const PASSWORD = 'correct-horse-battery-staple';
const TOKEN = 'valid-token';
const CLAIMS = {
  sub: 'user-1',
  email: 'admin@example.com',
  role: 'admin' as const,
};

function buildRepo(users: User[] = []) {
  const store = new Map<string, User>(users.map((u) => [u.email, { ...u }]));
  let seq = 0;

  const repo = {
    findOne: async ({ where }: { where: Partial<User> }) => {
      const all = [...store.values()];
      if (where.id) {
        return all.find((u) => u.id === where.id) ?? null;
      }
      if (where.email) {
        return store.get(where.email) ?? null;
      }
      return null;
    },
    // The service uses a query builder only to pull the `select: false` hash.
    createQueryBuilder: () => {
      const qb = {
        addSelect: () => qb,
        where: (_sql: string, params: { email: string }) => {
          qb._email = params.email;
          return qb;
        },
        getOne: async () => store.get(qb._email) ?? null,
        _email: '',
      };
      return qb;
    },
    create: (value: Partial<User>) => ({ ...value }) as User,
    save: async (user: User) => {
      if (!user.id) {
        user.id = `user-${++seq}`;
      }
      store.set(user.email, user);
      return user;
    },
    _store: store,
  };

  return repo;
}

async function buildService(users: User[] = []) {
  const repo = buildRepo(users);
  const jwt = {
    signAsync: vi.fn(async () => TOKEN),
    verifyAsync: vi.fn(async (token: string) => {
      if (token !== TOKEN) {
        throw new Error('invalid signature');
      }
      return CLAIMS;
    }),
  };
  const config = {
    getOrThrow: (key: string) => {
      if (key === 'auth') {
        return {
          jwtSecret: 'test-secret-at-least-16-chars',
          tokenTtlSeconds: 3600,
          adminEmail: 'admin@example.com',
          adminPassword: PASSWORD,
        };
      }
      throw new Error(`unexpected config key ${key}`);
    },
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      AuthService,
      { provide: getRepositoryToken(User), useValue: repo },
      { provide: JwtService, useValue: jwt },
      { provide: ConfigService, useValue: config },
    ],
  }).compile();

  return { service: moduleRef.get(AuthService), repo, jwt };
}

describe('AuthService', () => {
  let passwordHash: string;

  beforeAll(async () => {
    passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
  });

  function adminUser(overrides: Partial<User> = {}): User {
    return {
      id: 'user-1',
      email: 'admin@example.com',
      passwordHash,
      role: 'admin',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as User;
  }

  describe('login', () => {
    it('returns a token and the user for correct credentials', async () => {
      const { service, jwt } = await buildService([adminUser()]);

      const result = await service.login('admin@example.com', PASSWORD);

      expect(result.token).toBe(TOKEN);
      expect(result.user).toEqual({
        id: 'user-1',
        email: 'admin@example.com',
        role: 'admin',
      });
      // The password hash must never reach the caller.
      expect(JSON.stringify(result)).not.toContain('argon2');
      expect(jwt.signAsync).toHaveBeenCalledOnce();
    });

    it('normalises the email before lookup', async () => {
      const { service } = await buildService([adminUser()]);

      await expect(
        service.login('  ADMIN@Example.COM  ', PASSWORD),
      ).resolves.toMatchObject({ token: TOKEN });
    });

    it('rejects a wrong password', async () => {
      const { service } = await buildService([adminUser()]);

      await expect(
        service.login('admin@example.com', 'not-the-password'),
      ).rejects.toThrow(/invalid email or password/i);
    });

    it('rejects an unknown email with the same error', async () => {
      const { service } = await buildService([adminUser()]);

      await expect(
        service.login('nobody@example.com', PASSWORD),
      ).rejects.toThrow(/invalid email or password/i);
    });

    it.each([
      ['a missing email', undefined, PASSWORD],
      ['a missing password', 'admin@example.com', undefined],
      ['a blank email', '   ', PASSWORD],
      ['a blank password', 'admin@example.com', ''],
    ])('rejects %s as a bad request', async (_label, email, password) => {
      const { service } = await buildService([adminUser()]);

      await expect(service.login(email, password)).rejects.toThrow(
        /required/i,
      );
    });
  });

  describe('currentUser', () => {
    it('resolves the user behind a valid token', async () => {
      const { service } = await buildService([adminUser()]);

      await expect(service.currentUser(TOKEN)).resolves.toEqual({
        id: 'user-1',
        email: 'admin@example.com',
        role: 'admin',
      });
    });

    it('rejects an invalid token', async () => {
      const { service } = await buildService([adminUser()]);

      await expect(service.currentUser('garbage')).rejects.toThrow(
        /invalid or expired/i,
      );
    });

    it('rejects a valid token whose account no longer exists', async () => {
      const { service } = await buildService();

      await expect(service.currentUser(TOKEN)).rejects.toThrow(
        /no longer exists/i,
      );
    });
  });

  describe('seed', () => {
    it('creates the admin account when it is absent', async () => {
      const { service, repo } = await buildService();

      const created = await service.seed();

      expect(created).toBe(1);
      const stored = repo._store.get('admin@example.com');
      expect(stored?.role).toBe('admin');
      // Stored as a hash, and the hash must verify against the configured password.
      expect(stored?.passwordHash).not.toBe(PASSWORD);
      await expect(
        argon2.verify(stored!.passwordHash, PASSWORD),
      ).resolves.toBe(true);
    });

    it('does not touch an existing account', async () => {
      const { service, repo } = await buildService([adminUser()]);
      const before = repo._store.get('admin@example.com')?.passwordHash;

      const created = await service.seed();

      expect(created).toBe(0);
      expect(repo._store.get('admin@example.com')?.passwordHash).toBe(before);
    });
  });
});
