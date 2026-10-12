import { NextResponse } from "next/server";
import { gatewayFetchAsSession } from "../../../../lib/gateway";
import { clearSessionCookie } from "../../../../lib/session";

/**
 * Reports who is signed in, by asking identity-service rather than by decoding
 * the token here — the token's meaning belongs to the service that issued it,
 * and a decoded-but-unverified claim is not something to render.
 *
 * "Nobody is signed in" is a 401 rather than a 200 with `null`. The client
 * treats 401 as an ordinary state (`fetchSession` returns `null` for it), and
 * keeping the unauth case off the 200 path means a caching layer or a proxy
 * can never be handed a signed-out response as if it were a signed-in one.
 */
export async function GET(): Promise<NextResponse> {
  const upstream = await gatewayFetchAsSession("/auth/me");
  if (!upstream) {
    return NextResponse.json({ message: "Not signed in" }, { status: 401 });
  }

  if (!upstream.ok) {
    // Expired or revoked: drop the cookie so the UI stops retrying with it.
    await clearSessionCookie();
    return NextResponse.json(
      { message: "Your session has expired. Please sign in again." },
      { status: 401 },
    );
  }

  return NextResponse.json(await upstream.json());
}
