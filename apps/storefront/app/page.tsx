import { Suspense } from "react";
import Storefront from "./components/storefront";

/**
 * The shop.
 *
 * The catalog and cart are entirely client-side (the cart is browser state),
 * so this shell stays static and the interactivity lives in `<Storefront />`.
 *
 * The `<Suspense>` boundary is here for the *client* side of that: `Storefront`
 * reads the session to prefill the checkout email, and Cache Components
 * requires a boundary around anything that reads request state rather than
 * letting it block the shell. Without it the validation would flag this route
 * as blocking, because the static shell would have to wait on a cookie read
 * before it could render at all.
 */
export default function Home() {
  return (
    <main className="flex flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2 border-b border-black/10 pb-6 dark:border-white/15">
        <h1 className="text-3xl font-semibold tracking-tight">Catalog</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Products come from <code className="font-mono">catalog-service</code>{" "}
          through the api-gateway. Placing an order hits{" "}
          <code className="font-mono">orders-service</code>, which publishes{" "}
          <code className="font-mono">order.created</code>; catalog reserves the
          stock and notifications sends the confirmation.
        </p>
      </header>

      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <Storefront />
      </Suspense>
    </main>
  );
}
