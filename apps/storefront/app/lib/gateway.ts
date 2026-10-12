import "server-only";

import { readSessionToken } from "./session";

/**
 * Server-side access to the api-gateway.
 *
 * The browser never calls the gateway for anything authenticated. It calls this
 * app's own `/api/*` routes, which run on the server, read the httpOnly session
 * cookie and present it as a Bearer token. Two things fall out of that: no CORS
 * to configure (everything is same-origin in dev and behind nginx alike), and
 * the token is never exposed to client JavaScript.
 *
 * Note the public catalog does *not* go through here — it is read directly from
 * the browser (see `app/lib/api.ts`), because it needs no credential and a
 * server hop would only add a layer to debug.
 */

const GATEWAY_URL = (
  process.env.API_GATEWAY_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:4000"
).replace(/\/+$/, "");

export function gatewayFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    // Never cache an authenticated API call.
    cache: "no-store",
  });
}

/**
 * Calls the gateway with the session's token attached.
 * Returns `null` when there is no session, so the caller answers 401 without
 * ever reaching the network.
 */
export async function gatewayFetchAsSession(
  path: string,
  init: RequestInit = {},
): Promise<Response | null> {
  const token = await readSessionToken();
  if (!token) {
    return null;
  }
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  return gatewayFetch(path, { ...init, headers });
}

/**
 * Streams an upstream reply back to the browser unchanged.
 *
 * Cookies are forwarded explicitly. `writeSessionCookie` mutates the request's
 * cookie jar, and Next folds that jar into the *returned* response — but only
 * when the response object is one Next built. A `Response` constructed here
 * starts with an empty jar of its own, so the session cookie set moments
 * earlier would be silently dropped and sign-in would look successful while
 * leaving the browser signed out. The gateway sets no cookies of its own, so
 * anything present here is ours to pass on.
 */
export async function toNextResponse(upstream: Response): Promise<Response> {
  const headers = new Headers({
    "content-type": upstream.headers.get("content-type") ?? "application/json",
  });
  for (const cookie of upstream.headers.getSetCookie()) {
    headers.append("set-cookie", cookie);
  }
  if (upstream.status === 204) {
    return new Response(null, { status: 204, headers });
  }
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers,
  });
}
