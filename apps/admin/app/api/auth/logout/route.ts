import { NextResponse } from "next/server";
import { clearSessionCookie } from "../../../lib/session";

/**
 * Signs out by discarding the cookie. The token itself is stateless and stays
 * valid until it expires — that is the trade-off of not keeping a session
 * table, and it is why the TTL is hours rather than weeks.
 */
export async function POST(): Promise<NextResponse> {
  await clearSessionCookie();
  return new NextResponse(null, { status: 204 });
}
