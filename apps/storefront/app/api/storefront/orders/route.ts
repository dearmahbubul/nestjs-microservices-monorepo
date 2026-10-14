import { NextResponse } from "next/server";
import { gatewayFetchAsSession, toNextResponse } from "../../../lib/gateway";

/**
 * `GET /api/storefront/orders` — the signed-in customer's own order history.
 * `POST /api/storefront/orders` — places an order as the signed-in customer.
 *
 * Both go through this app's own handler so the session cookie becomes a
 * Bearer token on the server hop: the gateway rewrites `customerEmail` from
 * the verified token (see `applyIdentityScope`), so the order can only land
 * in the caller's own history. The body is forwarded verbatim apart from that.
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

export async function POST(request: Request): Promise<Response> {
  const upstream = await gatewayFetchAsSession("/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: await request.text(),
  });
  if (!upstream) {
    return NextResponse.json(
      { message: "Sign in to place an order." },
      { status: 401 },
    );
  }
  return toNextResponse(upstream);
}
