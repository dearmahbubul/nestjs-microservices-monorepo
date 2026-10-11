import { cookies } from "next/headers";

/**
 * Server-only session helpers.
 *
 * The token lives in an httpOnly cookie, which means it is set, read and
 * cleared exclusively on the server — browser JavaScript can never see it. The
 * client only ever learns *whether* it is signed in, via `/api/auth/session`.
 *
 * The cookie name lives here, not in `@repo/contracts`: it is private to this
 * app (nothing else sets or reads it), unlike the token's claims, which the
 * gateway and identity-service both have to agree on.
 */
export const SESSION_COOKIE = "admin_session";

/** Kept in step with AUTH_TOKEN_TTL_SECONDS on identity-service. */
const TTL_SECONDS = 60 * 60 * 8;

/** `path: "/admin"` scopes the cookie to this app's routes under nginx. */
const COOKIE_PATH = "/admin";

export async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function writeSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
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
  store.delete({ name: SESSION_COOKIE, path: COOKIE_PATH });
}
