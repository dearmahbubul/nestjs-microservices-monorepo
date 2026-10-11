/**
 * Browser-side client.
 *
 * Talks only to this app's own `/api/*` routes — never to the gateway. Those
 * routes run on the server, hold the session cookie and attach the token, so
 * nothing here ever touches a credential. A `401` therefore means the session
 * is gone, and the caller should send the operator back to the login page.
 */

export interface Product {
  id: string;
  name: string;
  /** Decimal string, e.g. "129.99" — never a float. */
  price: string;
  stock: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductInput {
  name: string;
  price: string;
  stock: number;
}

export interface AuthUser {
  id: string;
  email: string;
  role: string;
}

/**
 * This app is served under a sub-path (see `basePath` in next.config.ts).
 * Next prefixes *routes* automatically but NOT hand-written `fetch` URLs, so
 * the prefix has to be applied here. Keep the two in step.
 */
export const BASE_PATH = "/admin";

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_PATH}${path}`, {
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

/**
 * Pulls the most useful message out of an error reply. Nest returns
 * `{ message: string | string[] }`; anything else falls back to the status.
 */
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
    // Non-JSON body — fall through to the status.
  }
  return `Request failed (${response.status} ${response.statusText})`;
}

export function listProducts(): Promise<Product[]> {
  return request<Product[]>("/api/products");
}

export function createProduct(input: ProductInput): Promise<Product> {
  return request<Product>("/api/products", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateProduct(
  id: string,
  input: Partial<ProductInput>,
): Promise<Product> {
  return request<Product>(`/api/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteProduct(id: string): Promise<void> {
  return request<void>(`/api/products/${id}`, { method: "DELETE" });
}

export function fetchSession(): Promise<AuthUser> {
  return request<AuthUser>("/api/auth/session");
}

export function login(email: string, password: string): Promise<AuthUser> {
  return request<{ user: AuthUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  }).then((payload) => payload.user);
}

export async function logout(): Promise<void> {
  await fetch(`${BASE_PATH}/api/auth/logout`, { method: "POST" });
}

/** True when the failure was "your session is gone" rather than anything else. */
export function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
