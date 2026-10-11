import { redirect } from "next/navigation";
import ProductsManager from "./components/products-manager";
import SessionBar from "./components/session-bar";
import { gatewayFetch } from "./lib/gateway";
import { readSessionToken } from "./lib/session";

/**
 * This route reads the session cookie and calls identity-service, so there is
 * nothing meaningful to prerender — the page *is* the authenticated view.
 * `instant = false` opts out of the static-shell requirement that Cache
 * Components (see next.config.ts) would otherwise impose on a dynamic route.
 */
export const instant = false;

/**
 * The admin panel. Server-rendered so the session check happens before any of
 * it reaches the browser: no cookie, or a token identity-service no longer
 * accepts, and the visitor is sent to the login page without a flash of the
 * panel.
 */
export default async function ProductsPage() {
  const token = await readSessionToken();
  if (!token) {
    redirect("/login");
  }

  const response = await gatewayFetch("/auth/me", {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    redirect("/login");
  }

  const user = (await response.json()) as { email: string };

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Catalog</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Create, edit and remove the products the storefront sells.
          </p>
        </div>
        <SessionBar email={user.email} />
      </header>
      <ProductsManager />
    </div>
  );
}
