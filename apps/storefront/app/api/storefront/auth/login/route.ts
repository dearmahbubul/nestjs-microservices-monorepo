import { NextResponse } from "next/server";
import { gatewayFetch } from "../../../../lib/gateway";
import { writeSessionCookie } from "../../../../lib/session";

interface LoginPayload {
  token: string;
  user: { id: string; email: string; role: string };
}

/**
 * Signs in by exchanging credentials for a token, then keeping the token
 * server-side in an httpOnly cookie.
 *
 * The token is deliberately **not** returned to the browser — the response
 * carries only the user, which is all the UI needs to show who is signed in.
 * A token in a JSON response is a token in a React devtools panel and in every
 * `console.log` of the response; an httpOnly cookie is neither.
 *
 * This route also refuses to establish an admin session. The storefront is the
 * public shop, and a customer-facing form that can log somebody into the
 * operator panel is a privilege boundary crossed for no reason.
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

  const upstream = await gatewayFetch("/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(credentials),
  });

  const payload = (await upstream.json().catch(() => null)) as
    | LoginPayload
    | { message?: string }
    | null;

  if (!upstream.ok) {
    // Pass the service's own message through (e.g. "Invalid email or password")
    // but never its status text, which can leak implementation detail.
    const message =
      payload && "message" in payload && payload.message
        ? payload.message
        : "Sign in failed";
    return NextResponse.json({ message }, { status: upstream.status });
  }

  const { token, user } = payload as LoginPayload;
  if (user.role !== "customer") {
    // 403 rather than 401: the credentials were valid, this app is simply not
    // where that account signs in.
    return NextResponse.json(
      { message: "That account is not a customer account." },
      { status: 403 },
    );
  }

  await writeSessionCookie(token);
  return NextResponse.json({ user });
}
