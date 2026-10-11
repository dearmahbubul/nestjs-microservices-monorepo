"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createOrder,
  formatCents,
  listProducts,
  toCents,
  type Order,
  type Product,
} from "../lib/api";

/** productId -> quantity. A missing key means "not in the cart". */
type Cart = Record<string, number>;

const DEFAULT_EMAIL = "mahbubul@example.com";

export default function Storefront() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  /** Bumped to re-read the catalog: first mount, manual refresh, after an order. */
  const [reloadKey, setReloadKey] = useState(0);

  const [cart, setCart] = useState<Cart>({});
  const [email, setEmail] = useState(DEFAULT_EMAIL);
  const [placing, setPlacing] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);

  // Every state update happens inside the async continuation, never
  // synchronously in the effect body — otherwise the React Compiler's
  // `set-state-in-effect` rule (Next 16) flags a cascading render.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await listProducts();
        if (cancelled) return;
        setProducts(data);
        setListError(null);
      } catch (error) {
        if (cancelled) return;
        setListError(messageOf(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  /** Cart joined against the live catalog, so prices/stock are always current. */
  const lines = useMemo(
    () =>
      products
        .map((product) => ({ product, quantity: cart[product.id] ?? 0 }))
        .filter((line) => line.quantity > 0)
        .map((line) => ({
          ...line,
          lineCents: toCents(line.product.price) * line.quantity,
        })),
    [products, cart],
  );

  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const subtotalCents = lines.reduce((sum, line) => sum + line.lineCents, 0);

  function addToCart(product: Product) {
    setOrder(null);
    setCart((prev) => ({
      ...prev,
      // Never let the cart exceed what is on the shelf.
      [product.id]: Math.min((prev[product.id] ?? 0) + 1, product.stock),
    }));
  }

  function setQuantity(product: Product, quantity: number) {
    setOrder(null);
    setCart((prev) => {
      const clamped = Math.max(0, Math.min(quantity, product.stock));
      const next = { ...prev };
      if (clamped === 0) {
        delete next[product.id];
      } else {
        next[product.id] = clamped;
      }
      return next;
    });
  }

  function reload() {
    setLoading(true);
    setReloadKey((key) => key + 1);
  }

  async function onCheckout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCheckoutError(null);

    if (lines.length === 0) {
      setCheckoutError("Your cart is empty — add a product first.");
      return;
    }
    const customerEmail = email.trim();
    if (!customerEmail.includes("@")) {
      setCheckoutError("Enter a valid email address.");
      return;
    }

    setPlacing(true);
    try {
      const created = await createOrder({
        customerEmail,
        items: lines.map(({ product, quantity }) => ({
          productId: product.id,
          name: product.name,
          unitPrice: product.price,
          quantity,
        })),
      });
      setOrder(created);
      setCart({});
      // Stock is reserved asynchronously by catalog-service off the
      // `order.created` event, so re-read the catalog after a beat.
      setTimeout(() => setReloadKey((key) => key + 1), 1200);
    } catch (error) {
      setCheckoutError(messageOf(error));
    } finally {
      setPlacing(false);
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
      {/* ------------------------------------------------------- catalog */}
      <section className="min-w-0">
        <header className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Catalog</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {loading ? "Loading…" : `${products.length} products available`}
            </p>
          </div>
          <button
            type="button"
            onClick={reload}
            disabled={loading}
            className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium transition-colors hover:bg-black/[.04] disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/[.08]"
          >
            Refresh
          </button>
        </header>

        {listError && (
          <div
            role="alert"
            className="mb-5 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300"
          >
            Could not load products: {listError}
          </div>
        )}

        {loading && products.length === 0 && (
          <p className="text-sm text-zinc-500">Loading products…</p>
        )}

        {!loading && products.length === 0 && !listError && (
          <p className="rounded-xl border border-dashed border-black/15 px-4 py-12 text-center text-sm text-zinc-500 dark:border-white/15">
            No products yet. An operator can add some in the admin panel.
          </p>
        )}

        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => {
            const inCart = cart[product.id] ?? 0;
            const soldOut = product.stock === 0;
            return (
              <li
                key={product.id}
                className="flex flex-col gap-3 rounded-xl border border-black/10 p-4 dark:border-white/15"
              >
                <div className="flex flex-1 flex-col gap-1">
                  <span className="text-sm font-medium leading-5">
                    {product.name}
                  </span>
                  <span className="text-2xl font-semibold tracking-tight">
                    ${product.price}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`text-xs ${
                      soldOut
                        ? "text-red-600 dark:text-red-400"
                        : "text-zinc-500 dark:text-zinc-400"
                    }`}
                  >
                    {soldOut ? "Out of stock" : `${product.stock} in stock`}
                  </span>
                  {inCart > 0 && (
                    <span className="rounded-full bg-black/[.06] px-2 py-0.5 text-xs font-medium tabular-nums dark:bg-white/10">
                      {inCart} in cart
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => addToCart(product)}
                  disabled={soldOut || inCart >= product.stock}
                  className="rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {soldOut
                    ? "Unavailable"
                    : inCart >= product.stock
                      ? "Max in cart"
                      : "Add to cart"}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ---------------------------------------------------------- cart */}
      <aside className="lg:sticky lg:top-10 lg:self-start">
        <form
          onSubmit={onCheckout}
          className="flex flex-col gap-5 rounded-xl border border-black/10 p-5 dark:border-white/15"
        >
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Your cart</h2>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </span>
          </div>

          {lines.length === 0 ? (
            <p className="rounded-lg border border-dashed border-black/15 px-4 py-8 text-center text-sm text-zinc-500 dark:border-white/15">
              Your cart is empty.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-black/10 dark:divide-white/10">
              {lines.map(({ product, quantity, lineCents }) => (
                <li key={product.id} className="flex flex-col gap-2 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-medium leading-5">
                      {product.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity(product, 0)}
                      aria-label={`Remove ${product.name} from cart`}
                      className="text-xs text-zinc-500 underline-offset-2 hover:text-red-600 hover:underline dark:text-zinc-400 dark:hover:text-red-400"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center rounded-lg border border-black/15 dark:border-white/20">
                      <button
                        type="button"
                        onClick={() => setQuantity(product, quantity - 1)}
                        aria-label={`Decrease ${product.name} quantity`}
                        className="px-3 py-1 text-sm leading-6 transition-colors hover:bg-black/[.04] dark:hover:bg-white/[.08]"
                      >
                        −
                      </button>
                      <span className="min-w-8 text-center text-sm tabular-nums">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => setQuantity(product, quantity + 1)}
                        disabled={quantity >= product.stock}
                        aria-label={`Increase ${product.name} quantity`}
                        className="px-3 py-1 text-sm leading-6 transition-colors hover:bg-black/[.04] disabled:opacity-40 dark:hover:bg-white/[.08]"
                      >
                        +
                      </button>
                    </div>
                    <span className="font-mono text-sm tabular-nums">
                      ${formatCents(lineCents)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-baseline justify-between border-t border-black/10 pt-4 dark:border-white/15">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              Subtotal
            </span>
            <span className="text-xl font-semibold tabular-nums">
              ${formatCents(subtotalCents)}
            </span>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">
              Email for the confirmation
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-lg border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/50 dark:border-white/20 dark:focus:border-white/60"
            />
          </label>

          {checkoutError && (
            <p
              role="alert"
              className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300"
            >
              {checkoutError}
            </p>
          )}

          <button
            type="submit"
            disabled={placing || lines.length === 0}
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {placing
              ? "Placing order…"
              : `Place order · $${formatCents(subtotalCents)}`}
          </button>
        </form>

        {order && (
          <div className="mt-5 flex flex-col gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-800 dark:text-emerald-300">
            <span className="font-semibold">
              Order {order.status} · {order.items.length}{" "}
              {order.items.length === 1 ? "line" : "lines"}
            </span>
            <ul className="flex flex-col gap-1">
              {order.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3">
                  <span>
                    {item.quantity} × {item.name}
                  </span>
                  <span className="font-mono tabular-nums">
                    ${item.lineTotal}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between border-t border-emerald-500/30 pt-2 font-semibold">
              <span>Total</span>
              <span className="font-mono tabular-nums">${order.total}</span>
            </div>
            <span className="text-xs opacity-80">
              Confirmation sent to {order.customerEmail} · id {order.id}
            </span>
          </div>
        )}
      </aside>
    </div>
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
