/**
 * Browser-side client for the shop.
 *
 * Split by who carries the credential:
 * - The catalog is public: read straight from the browser via API_BASE (`/api`).
 * - Everything authenticated goes through this app's own route handlers via
 *   LOCAL_BASE (`/api/storefront` behind nginx, `/api` in dev) — see
 *   `app/lib/gateway.ts` for why the token never reaches the browser.
 *
 * Money is a decimal string everywhere on the wire ("129.99") — never a float.
 * Arithmetic happens in integer cents and is formatted back on the way out.
 */

const API_BASE =
  (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "") || "/api";

// Where this app's own Route Handlers live, as the browser sees them.
// Derived because the environments differ: with nginx they sit under
// `/api/storefront`; with no nginx (dev) they really are at `/api`. An
// explicit NEXT_PUBLIC_APP_BASE always wins.
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

/** One line of the saved cart. */
export interface CartItem {
  productId: string;
  quantity: number;
}

/** The saved cart, as returned by cart-service. */
export interface Cart {
  customerEmail: string;
  items: CartItem[];
  createdAt?: string;
  updatedAt?: string;
}

/** Local (signed-out) cart: productId -> quantity. */
export type LocalCart = Record<string, number>;

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
 * `items` only — the email is deliberately absent, and the call goes through
 * this app's own route handler so the session cookie becomes a Bearer token
 * server-side. The gateway replaces `customerEmail` with the one in the
 * session token (see `applyIdentityScope`), so the address is a fact of the
 * session rather than of the request body.
 */
export function createOrder(
  input: { items: OrderItemInput[] },
  signal?: AbortSignal,
): Promise<Order> {
  return localRequest<Order>("/orders", {
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
  // The saved cart belongs to the account; the local one is dropped so the
  // next sign-in does not inherit it.
  clearLocalCart();
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

// ------------------------------------------------------- saved cart

const GUEST_CART_KEY = "guest-cart";

function readLocalCart(): LocalCart {
  try {
    const raw = window.localStorage.getItem(GUEST_CART_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const cart: LocalCart = {};
    for (const [productId, quantity] of Object.entries(parsed)) {
      if (typeof quantity === "number" && quantity > 0) {
        cart[productId] = quantity;
      }
    }
    return cart;
  } catch {
    return {};
  }
}

function writeLocalCart(cart: LocalCart): void {
  try {
    if (Object.keys(cart).length === 0) {
      window.localStorage.removeItem(GUEST_CART_KEY);
    } else {
      window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify(cart));
    }
  } catch {
    /* storage unavailable — the cart stays in memory only */
  }
}

function clearLocalCart(): void {
  try {
    window.localStorage.removeItem(GUEST_CART_KEY);
  } catch {
    /* ignore */
  }
}

export function getLocalCart(): LocalCart {
  return readLocalCart();
}

export function saveLocalCart(cart: LocalCart): void {
  writeLocalCart(cart);
}

export function forgetLocalCart(): void {
  clearLocalCart();
}

/** The saved cart. Signed-out callers use local storage instead. */
export function getCart(): Promise<Cart> {
  return localRequest<Cart>("/cart");
}

/** Sets a line's quantity; 0 removes it. */
export function setCartItem(productId: string, quantity: number): Promise<Cart> {
  return localRequest<Cart>(`/cart/items/${encodeURIComponent(productId)}`, {
    method: "PUT",
    body: JSON.stringify({ quantity }),
  });
}

/** Removes a line. */
export function removeCartItem(productId: string): Promise<Cart> {
  return localRequest<Cart>(`/cart/items/${encodeURIComponent(productId)}`, {
    method: "DELETE",
  });
}

/** Empties the saved cart. */
export function clearCart(): Promise<Cart> {
  return localRequest<Cart>("/cart", { method: "DELETE" });
}

/** True when the failure was "your session is gone" rather than anything else. */
export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

