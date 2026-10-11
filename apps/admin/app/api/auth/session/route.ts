import { NextResponse } from "next/server";
import { gatewayFetchAsSession, unauthorized } from "../../../lib/gateway";
import { clearSessionCookie } from "../../../lib/session";

/**
 * Reports who is signed in, by asking identity-service rather than by decoding
 * the token here — the token's meaning belongs to the service that issued it,
 * and a decoded-but-unverified claim is not something to render.
 */
export async function GET(): Promise<NextResponse> {
  const upstream = await gatewayFetchAsSession("/auth/me");
  if (!upstream) {
    return unauthorized("Not signed in");
  }

  if (!upstream.ok) {
    // Expired or revoked: drop the cookie so the UI stops retrying with it.
    await clearSessionCookie();
    return unauthorized();
  }

  return NextResponse.json(await upstream.json());
}
