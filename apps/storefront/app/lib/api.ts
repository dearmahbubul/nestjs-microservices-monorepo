/**
 * Browser-side client for the shop.
 *
 * The storefront is public, so unlike the admin app there is no session to
 * carry: it talks to the api-gateway directly. Behind nginx that is the page's
 * own origin (`/api/...`, forwarded by nginx); for `next dev` the gateway port
 * comes from `NEXT_PUBLIC_API_URL`. Either way the only thing that changes is
 * the base URL.
 *
 * Money is a decimal *string* everywhere on the wire (`"129.99"`) — never a
 * float. Arithmetic happens in integer cents and is formatted back on the way
 * out, so `0.1 + 0.2` can never leak into a total.
 */

const API_BASE =
  (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "") || "/api";

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

export interface OrderInput {
  customerEmail: string;
  items: OrderItemInput[];
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });

  if (!response.ok) {
    throw new ApiError(await errorMessage(response), response.status);
  }
  return (await response.json()) as T;
}

export function listProducts(): Promise<Product[]> {
  return request<Product[]>("/products");
}

export function createOrder(input: OrderInput): Promise<Order> {
  return request<Order>("/orders", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
