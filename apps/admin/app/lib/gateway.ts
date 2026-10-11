import { NextResponse } from "next/server";
import { readSessionToken } from "./session";

/**
 * Server-side access to the api-gateway.
 *
 * The browser never calls the gateway directly. It calls this app's own
 * `/api/*` routes, which run on the server, read the httpOnly session cookie
 * and attach it as a Bearer token. Two things fall out of that: there is no
 * CORS to configure (everything is same-origin, in dev and behind nginx alike),
 * and the token is never exposed to client JavaScript.
 */

const GATEWAY_URL = (
  process.env.API_GATEWAY_URL ?? "http://localhost:4000"
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

/** Streams an upstream reply back to the browser unchanged. */
export async function toNextResponse(upstream: Response): Promise<NextResponse> {
  if (upstream.status === 204) {
    return new NextResponse(null, { status: 204 });
  }
  return new NextResponse(await upstream.text(), {
    status: upstream.status,
    headers: {
      "content-type":
        upstream.headers.get("content-type") ?? "application/json",
    },
  });
}

export function unauthorized(
  message = "Your session has expired. Please sign in again.",
): NextResponse {
  return NextResponse.json({ message }, { status: 401 });
}
