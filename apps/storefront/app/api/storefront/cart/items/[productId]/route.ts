import { NextResponse } from "next/server";
import { gatewayFetchAsSession, toNextResponse } from "../../../../../lib/gateway";

type Params = { params: Promise<{ productId: string }> };

/**
 * `PUT /api/cart/items/:productId` — set a line's quantity (0 removes it).
 * `DELETE /api/cart/items/:productId` — remove the line.
 *
 * The body is forwarded verbatim: cart-service owns what a valid line is.
 */
async function forward(
  request: Request,
  productId: string,
  method: "PUT" | "DELETE",
): Promise<Response> {
  const upstream = await gatewayFetchAsSession(
    `/cart/items/${encodeURIComponent(productId)}`,
    {
      method,
      headers: { "content-type": "application/json" },
      body: method === "PUT" ? await request.text() : undefined,
    },
  );
  if (!upstream) {
    return NextResponse.json(
      { message: "Sign in to update your cart." },
      { status: 401 },
    );
  }
  return toNextResponse(upstream);
}

export async function PUT(request: Request, { params }: Params): Promise<Response> {
  const { productId } = await params;
  return forward(request, productId, "PUT");
}

export async function DELETE(
  _request: Request,
  { params }: Params,
): Promise<Response> {
  const { productId } = await params;
  return forward(_request, productId, "DELETE");
}
