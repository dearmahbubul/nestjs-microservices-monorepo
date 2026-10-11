import Storefront from "./components/storefront";

/**
 * The shop. Catalog and cart are entirely client-side (the cart is browser
 * state), so this shell stays static and the interactivity lives in
 * `<Storefront />`.
 */
export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2 border-b border-black/10 pb-6 dark:border-white/15">
        <h1 className="text-3xl font-semibold tracking-tight">Storefront</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Products come from <code className="font-mono">catalog-service</code>{" "}
          through the api-gateway. Placing an order hits{" "}
          <code className="font-mono">orders-service</code>, which publishes{" "}
          <code className="font-mono">order.created</code>; catalog reserves the
          stock and notifications sends the confirmation.
        </p>
      </header>

      <Storefront />
    </div>
  );
}
