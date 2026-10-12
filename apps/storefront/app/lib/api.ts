/**
 * Browser-side client for the shop.
 *
 * Split by who carries the credential, which is not an arbitrary line:
 *
 * - The **catalog** is public. It is read straight from the browser here, with
 *   no session and no server hop in between.
 * - Everything **authenticated** (signing in, the session, order history) goes
 *   through this app's own route handlers instead — see `app/lib/gateway.ts`
 *   for why the token never reaches the browser.
 *
 * Those two live at different origins' worth of paths behind nginx, so they get
 * different bases:
 *
 * - `API_BASE` points at the **gateway**, which owns the public catalog. nginx
 *   only forwards `/api/products*` there, so the catalog reads `/products`
 *   while listing `/orders` would 404 — placing an order is authenticated and
 *   so goes through `LOCAL_BASE` below, like every other state-changing call.
 * - `LOCAL_BASE` points at **this app**, whose Route Handlers are mounted under
 *   `/api/storefront/*` (nginx routes that prefix here; the plain `/api/*` is
 *   reserved for the gateway, so the two never collide).
 *
 * For `next dev` there is no nginx: `NEXT_PUBLIC_API_URL` points at the gateway
 * port directly and the storefront's handlers are at `/api/*`, so `LOCAL_BASE`
 * can be empty. Set `NEXT_PUBLIC_APP_BASE` only if the app is served under a
 * sub-path.
 *
 * Money is a decimal *string* everywhere on the wire (`"129.99"`) — never a
 * float. Arithmetic happens in integer cents and is formatted back on the way
 * out, so `0.1 + 0.2` can never leak into a total.
 */

const API_BASE =
  (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "") || "/api";

/**
 * Where this app's own Route Handlers live, as the browser sees them.
 *
 * The default is derived rather than hard-coded because the two environments
 * genuinely differ: with Next running behind nginx (`NEXT_PUBLIC_API_URL` set,
 * so there *is* a split) the handlers sit under `/api/storefront`; with no
 * nginx (dev, where `NEXT_PUBLIC_API_URL` is empty) they really are at `/api`.
 * An explicit `NEXT_PUBLIC_APP_BASE` always wins, for a sub-path deployment.
 */
const LOCAL_BASE = (
  process.env.NEXT_PUBLIC_APP_BASE ??
  (process.env.NEXT_PUBLIC_API_URL ? "/api/storefront" : "/api")
).replace(/\/+$/, "");

import type { AuthUser } from "@repo/contracts";

export type { AuthUser };

/** Marks this module as browser-only, mirroring the server-only guards. */
export const BROWSER_ONLY = true;

export interface Product {
  id: string;
  name: string;
  /** Decimal string, e.g. "129.99". */
  price: string;
  stock: number;
  createdAt: string;
  updatedAt: string;
}

/** One line of a checkout: what the orders service expects on `POST /orders`. */
export interface OrderItemInput {
  productId: string;
  name: string;
  unitPrice: string;
  quantity: number;
}

export interface OrderItem extends OrderItemInput {
  id: string;
  orderId: string;
  lineTotal: string;
}

export interface Order {
  id: string;
  customerEmail: string;
  status: string;
  total: string;
  items: OrderItem[];
  createdAt: string;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** `"129.99"` -> `12999`. Rounds, so `Number("129.99") * 100` cannot drift. */
export function toCents(price: string): number {
  return Math.round(Number(price) * 100);
}

/** `12999` -> `"129.99"`. */
export function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    const { message } = body;
    if (Array.isArray(message)) {
      return message.join(", ");
    }
    if (typeof message === "string" && message !== "") {
      return message;
    }
  } catch {
    // Non-JSON body — fall through to the status line.
  }
  return `Request failed (${response.status} ${response.statusText})`;
}

/** `path` is relative to the public API base (`/api` behind nginx). */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });

  if (!response.ok) {
    throw new ApiError(await errorMessage(response), response.status);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/** `path` is relative to this app's own origin, for the session-backed routes. */
async function localRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${LOCAL_BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });

  if (!response.ok) {
    throw new ApiError(await errorMessage(response), response.status);
  }
  return (await response.json()) as T;
}

/**
 * One page of the catalog.
 *
 * `signal` is threaded through so a component that unmounts mid-request can
 * abort it — an infinite scroll starts a fetch per scroll position, and without
 * this a fast scroller leaves a trail of in-flight requests queued behind the
 * one it is waiting for.
 */
export function listProducts(
  page: { limit?: number; offset?: number } = {},
  signal?: AbortSignal,
): Promise<Product[]> {
  const params = new URLSearchParams();
  if (page.limit !== undefined) {
    params.set("limit", String(page.limit));
  }
  if (page.offset !== undefined) {
    params.set("offset", String(page.offset));
  }
  const query = params.toString();
  return request<Product[]>(`/products${query ? `?${query}` : ""}`, { signal });
}

/** Total rows in the catalog — what the sentinel compares against. */
export async function countProducts(signal?: AbortSignal): Promise<number> {
  const { count } = await request<{ count: number }>("/products/count", {
    signal,
  });
  return count;
}

/**
 * Places an order for the signed-in customer.
 *
 * `items` only — the email is deliberately absent. A browser-held email is an
 * assertion, and this endpoint is reachable by anyone: posting a stranger's
 * address would place an order in that stranger's history. The gateway replaces
 * `customerEmail` with the one in the session token (see `applyIdentityScope`),
 * so the address is a fact of the session rather than of the request body.
 */
export function createOrder(
  input: { items: OrderItemInput[] },
  signal?: AbortSignal,
): Promise<Order> {
  return request<Order>("/orders", {
    method: "POST",
    body: JSON.stringify(input),
    signal,
  });
}

// ------------------------------------------------------- authenticated

/** Who is signed in, or `null` when nobody is. Never throws for "nobody". */
export async function fetchSession(): Promise<AuthUser | null> {
  const response = await fetch(`${LOCAL_BASE}/auth/session`, {
    cache: "no-store",
  });
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new ApiError(await errorMessage(response), response.status);
  }
  return (await response.json()) as AuthUser;
}

export function login(email: string, password: string): Promise<AuthUser> {
  return localRequest<{ user: AuthUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  }).then((payload) => payload.user);
}

/** Creates the account and signs it in in one step. */
export function register(email: string, password: string): Promise<AuthUser> {
  return localRequest<{ user: AuthUser }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  }).then((payload) => payload.user);
}

export async function logout(): Promise<void> {
  await fetch(`${LOCAL_BASE}/auth/logout`, { method: "POST" });
}

/**
 * The signed-in customer's own orders.
 *
 * No email is passed: the gateway overwrites the filter with the one from the
 * session token, so this endpoint cannot be pointed at another customer even if
 * the caller tries.
 */
export function listMyOrders(): Promise<Order[]> {
  return localRequest<Order[]>("/orders");
}

/** True when the failure was "your session is gone" rather than anything else. */
export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

