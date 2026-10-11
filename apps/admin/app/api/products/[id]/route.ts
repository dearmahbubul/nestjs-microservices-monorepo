import { NextResponse } from "next/server";
import {
  gatewayFetchAsSession,
  toNextResponse,
  unauthorized,
} from "../../../lib/gateway";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/products/:id — partial update. */
export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const body = await request.text();
  const upstream = await gatewayFetchAsSession(`/products/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body,
  });
  if (!upstream) {
    return unauthorized();
  }
  return toNextResponse(upstream);
}

/** DELETE /api/products/:id — remove a product. */
export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const upstream = await gatewayFetchAsSession(
    `/products/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  if (!upstream) {
    return unauthorized();
  }
  return toNextResponse(upstream);
}
