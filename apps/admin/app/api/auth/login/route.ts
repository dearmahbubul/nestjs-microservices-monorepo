import { NextResponse } from "next/server";
import { gatewayFetch } from "../../../lib/gateway";
import { writeSessionCookie } from "../../../lib/session";

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
  await writeSessionCookie(token);
  return NextResponse.json({ user });
}
