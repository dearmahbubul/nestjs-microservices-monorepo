import { NextResponse } from "next/server";
import {
  gatewayFetchAsSession,
  toNextResponse,
  unauthorized,
} from "../../lib/gateway";

/** GET /api/products — list the catalog. */
export async function GET(): Promise<NextResponse> {
  const upstream = await gatewayFetchAsSession("/products");
  if (!upstream) {
    return unauthorized();
  }
  return toNextResponse(upstream);
}

/** POST /api/products — create a product. */
export async function POST(request: Request): Promise<NextResponse> {
  const body = await request.text();
  const upstream = await gatewayFetchAsSession("/products", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  if (!upstream) {
    return unauthorized();
  }
  return toNextResponse(upstream);
}
