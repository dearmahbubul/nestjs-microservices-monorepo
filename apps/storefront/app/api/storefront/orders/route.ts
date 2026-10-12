import { NextResponse } from "next/server";
import { gatewayFetchAsSession, toNextResponse } from "../../../lib/gateway";

/**
 * `GET /api/orders` — the signed-in customer's own order history.
 *
 * Note what is *not* here: a `customerEmail` query parameter. This handler
 * deliberately forwards no filter at all. The gateway injects the email from
 * the verified token and deletes any the client sent (see
 * `applyIdentityScope` in the gateway's proxy service), so the scoping is
 * enforced at the one hop the client cannot reach around.
 *
 * Passing the email through from the request here would look harmless and would
 * hand the caller control of the filter; the gateway would strip it, but the
 * two would be relying on each other for correctness. One owner for the rule.
 */
export async function GET(): Promise<Response> {
  const upstream = await gatewayFetchAsSession("/orders");
  if (!upstream) {
    return NextResponse.json(
      { message: "Sign in to see your orders." },
      { status: 401 },
    );
  }
  return toNextResponse(upstream);
}
