/**
 * The auth token contract, shared by the issuer (`identity-service`) and the
 * verifier (`api-gateway`).
 *
 * Only the *shape* lives here — the claims, the roles, the cookie name. The
 * signing and verification are done by `@nestjs/jwt` on both sides, so this
 * package stays free of crypto: a JWT implementation is not something to
 * hand-roll, and one library used twice cannot drift from itself the way two
 * copies of a spec could.
 *
 * A token is a *bearer* credential: whoever holds it is treated as the user.
 * It is only ever carried in an httpOnly cookie (browser) or an Authorization
 * header (server-to-server), never in a URL or localStorage.
 */

/** Roles the system understands. Only `admin` may write the catalog today. */
export type UserRole = 'admin' | 'customer';

/** A user as exposed over the wire — never includes the password hash. */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

/** The JWT payload. `iat`/`exp` are Unix seconds, per RFC 7519. */
export interface TokenClaims {
  /** Subject: the user id. */
  sub: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

/** What `login` returns: the token plus the user it belongs to. */
export interface LoginResponse {
  token: string;
  user: AuthUser;
}

/** Scheme prefix expected on the `Authorization` header. */
export const AUTH_SCHEME = 'Bearer';

/**
 * Extracts the token from an `Authorization` header value.
 * Returns `null` for a missing or non-Bearer header. Pure string work — the
 * token is not validated here, only located.
 */
export function bearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }
  const [scheme, value] = header.split(' ');
  if (scheme?.toLowerCase() !== AUTH_SCHEME.toLowerCase() || !value) {
    return null;
  }
  return value;
}
