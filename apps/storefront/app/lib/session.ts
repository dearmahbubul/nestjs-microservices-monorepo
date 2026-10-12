import "server-only";

import { cookies } from "next/headers";

/**
 * Server-only session helpers.
 *
 * The token lives in an httpOnly cookie: set, read and cleared exclusively on
 * the server, so browser JavaScript can never see it. A client component learns
 * *whether* it is signed in by asking a route handler, never by reading the
 * cookie itself.
 *
 * The cookie name is private to this app, so unlike the token's claims (which
 * identity-service and the gateway both have to agree on) it lives here rather
 * than in `@repo/contracts`.
 */
export const CUSTOMER_SESSION_COOKIE = "storefront_session";

/** Kept in step with AUTH_TOKEN_TTL_SECONDS on identity-service. */
const TTL_SECONDS = 60 * 60 * 8;

/**
 * Scoped to the whole site, not to a sub-path.
 *
 * The admin app uses `/admin` because it is mounted under one; the storefront
 * is the root application, and a customer who signs in on `/login` has to still
 * be signed in on `/orders`. `path: "/"` is what makes the cookie one session
 * rather than two.
 */
const COOKIE_PATH = "/";

export async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(CUSTOMER_SESSION_COOKIE)?.value ?? null;
}

export async function writeSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(CUSTOMER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Deliberately opt-in, NOT derived from NODE_ENV: the docker stack serves
    // this app over plain HTTP through nginx, and a Secure cookie is silently
    // dropped there — login would appear to succeed and then bounce straight
    // back. Turn this on when the deployment terminates TLS.
    secure: process.env.SESSION_COOKIE_SECURE === "true",
    path: COOKIE_PATH,
    maxAge: TTL_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete({ name: CUSTOMER_SESSION_COOKIE, path: COOKIE_PATH });
}
