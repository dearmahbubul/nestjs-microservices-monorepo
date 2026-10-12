import { cache } from "react";
import { gatewayFetchAsSession } from "./gateway";
import { readSessionToken } from "./session";
import type { AuthUser } from "@repo/contracts";

/**
 * The signed-in customer, or `null` when nobody is.
 *
 * This is the Data Access Layer the Next docs recommend: one function that
 * answers "who is this" so no route has to remember how. It does not redirect —
 * a signed-out visitor is a legitimate state for the shop, and a page that
 * insists on a session says so itself.
 *
 * Wrapped in React's `cache` so the header, the page and any nested component
 * asking the same question in one render pass share a single call to
 * identity-service instead of one each.
 */
export const currentUser = cache(async (): Promise<AuthUser | null> => {
  const token = await readSessionToken();
  if (!token) {
    return null;
  }

  const response = await gatewayFetchAsSession("/auth/me");
  if (!response?.ok) {
    // An expired token is treated exactly like no token: the visitor is
    // signed out, and only a route handler clears the stale cookie (a Server
    // Component cannot set one).
    return null;
  }

  return (await response.json()) as AuthUser;
});
