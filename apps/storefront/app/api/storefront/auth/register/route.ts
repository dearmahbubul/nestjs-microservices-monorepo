import { NextResponse } from "next/server";
import { gatewayFetch } from "../../../../lib/gateway";
import { writeSessionCookie } from "../../../../lib/session";

interface RegisterPayload {
  token: string;
  user: { id: string; email: string; role: string };
}

/**
 * Creates a customer account and signs it in, in one round trip.
 *
 * `identity-service` already returns a token from `/auth/register` — making the
 * visitor then submit the login form with the credentials they just typed would
 * be a second request that can only fail.
 *
 * The role is not read from the request and is not trusted from the response
 * either; `AuthService.register` hard-codes `customer`, and the check below is
 * a cheap assertion that it still does.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let credentials: unknown;
  try {
    credentials = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Request body must be JSON" },
      { status: 400 },
    );
  }

  const upstream = await gatewayFetch("/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(credentials),
  });

  const payload = (await upstream.json().catch(() => null)) as
    | RegisterPayload
    | { message?: string }
    | null;

  if (!upstream.ok) {
    const message =
      payload && "message" in payload && payload.message
        ? payload.message
        : "Could not create your account";
    return NextResponse.json({ message }, { status: upstream.status });
  }

  const { token, user } = payload as RegisterPayload;
  if (user.role !== "customer") {
    return NextResponse.json(
      { message: "That account is not a customer account." },
      { status: 403 },
    );
  }

  await writeSessionCookie(token);
  return NextResponse.json({ user }, { status: 201 });
}
