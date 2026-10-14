import { NextResponse } from "next/server";
import { gatewayFetchAsSession, toNextResponse } from "../../../lib/gateway";

/**
 * `GET /api/cart` — the signed-in customer's saved cart.
 *
 * Mirrors the orders handler: no filter is sent, because the gateway injects
 * the email from the session token and drops any the client supplied.
 */
export async function GET(): Promise<Response> {
  const upstream = await gatewayFetchAsSession("/cart");
  if (!upstream) {
    return NextResponse.json(
      { message: "Sign in to see your cart." },
      { status: 401 },
    );
  }
  return toNextResponse(upstream);
}

/** `DELETE /api/cart` — empties the saved cart (used after checkout). */
export async function DELETE(): Promise<Response> {
  const upstream = await gatewayFetchAsSession("/cart", { method: "DELETE" });
  if (!upstream) {
    return NextResponse.json(
      { message: "Sign in to update your cart." },
      { status: 401 },
    );
  }
  return toNextResponse(upstream);
}
