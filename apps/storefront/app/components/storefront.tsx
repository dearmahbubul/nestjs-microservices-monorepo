"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  createOrder,
  fetchSession,
  formatCents,
  toCents,
  type AuthUser,
  type Order,
  type Product,
} from "../lib/api";
import { useCatalog } from "../lib/use-catalog";
import { useInView } from "../lib/use-in-view";

/** productId -> quantity. A missing key means "not in the cart". */
type Cart = Record<string, number>;

export default function Storefront() {
  const catalog = useCatalog();
  const { products, total, loading, done, error, loadMore, reload, generation } =
    catalog;

  const [cart, setCart] = useState<Cart>({});
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [order, setOrder] = useState<Order | null>(null);

  /**
   * Checkout needs an identity, and the only trustworthy one is the session.
   *
   * `null` here means "signed out", which is the ordinary case for a shop — a
   * catalogue does not require an account. It is recorded separately from the
   * fetch having settled so the cart does not flash "please sign in" during the
   * first render, before the session answer has arrived.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const session = await fetchSession();
        if (!cancelled) {
          setUser(session);
        }
      } catch {
        // A failed session probe is indistinguishable from "signed out" for the
        // user's purposes, and checkout will say so plainly if they try.
      } finally {
        if (!cancelled) {
          setSessionChecked(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * The autoload trigger.
   *
   * Keyed on the number of products already loaded, so each page arms a fresh
   * observer below the content it just added. `generation` folds in the reload
   * counter, so a manual refresh re-arms a sentinel that had already fired.
   */
  const [sentinelRef, sentinelVisible] = useInView(
    `${generation}:${products.length}`,
  );

  useEffect(() => {
    if (sentinelVisible && !done) {
      loadMore();
    }
  }, [sentinelVisible, done, loadMore]);

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

  function reloadCatalog() {
    setOrder(null);
    reload();
  }

  async function onCheckout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCheckoutError(null);

    if (lines.length === 0) {
      setCheckoutError("Your cart is empty — add a product first.");
      return;
    }
    if (!user) {
      setCheckoutError("Please sign in to place an order.");
      return;
    }

    setPlacing(true);
    try {
      // No email is sent: the gateway takes it from the session token, so the
      // order can only ever land in the signed-in customer's own history.
      const created = await createOrder({
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
      // `order.created` event, so re-read the catalog after a beat. A full
      // reload rather than a patched list: the reservation is all-or-nothing
      // and we do not know here whether it succeeded.
      setTimeout(reload, 1200);
    } catch (err) {
      setCheckoutError(
        err instanceof Error ? err.message : "Something went wrong.",
      );
    } finally {
      setPlacing(false);
    }
  }

  const loadedLabel =
    total === null
      ? `${products.length} loaded`
      : `${products.length} of ${total} loaded`;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
      {/* ------------------------------------------------------- catalog */}
      <section className="min-w-0">
        <header className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Products</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {loading && products.length === 0 ? "Loading…" : loadedLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={reloadCatalog}
            disabled={loading}
            className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium transition-colors hover:bg-black/[.04] disabled:opacity-40 dark:border-white/15 dark:hover:bg-white/[.08]"
          >
            Refresh
          </button>
        </header>

        {error && (
          <div
            role="alert"
            className="mb-5 flex flex-wrap items-center gap-3 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300"
          >
            <span>Could not load more products: {error}</span>
            <button
              type="button"
              onClick={loadMore}
              className="font-medium underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        )}

        {loading && products.length === 0 && (
          <p className="text-sm text-zinc-500">Loading products…</p>
        )}

        {!loading && products.length === 0 && !error && (
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

        {/*
          The autoload sentinel. Always rendered — hiding it when `done` would
          unmount the node the observer is attached to, and the reveal itself
          would then be missed. `aria-hidden` keeps a zero-height marker out of
          the accessibility tree.
        */}
        <div ref={sentinelRef} aria-hidden className="h-px w-full" />

        <div className="mt-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {loading && products.length > 0 && <span>Loading more…</span>}
          {!loading && done && products.length > 0 && (
            <span>That is the whole catalog.</span>
          )}
          {!loading && !done && !error && products.length > 0 && (
            <span>Scroll for more.</span>
          )}
        </div>
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

          {/*
            The identity the order will be filed under. It is shown rather than
            asked for: the gateway stamps the order with the session's email, so
            an editable field here would only invite a value that gets ignored.
          */}
          {sessionChecked && user && (
            <div className="flex flex-col gap-0.5 text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">
                Ordering as
              </span>
              <span className="font-medium">{user.email}</span>
            </div>
          )}

          {sessionChecked && !user && (
            <div className="flex flex-col gap-2 rounded-lg border border-black/10 px-4 py-3 text-sm dark:border-white/15">
              <span className="text-zinc-600 dark:text-zinc-400">
                Sign in to place an order.
              </span>
              <span className="flex gap-3">
                <Link
                  href="/login"
                  className="font-medium underline underline-offset-2"
                >
                  Sign in
                </Link>
                <Link
                  href="/register"
                  className="text-zinc-600 underline underline-offset-2 dark:text-zinc-400"
                >
                  Create account
                </Link>
              </span>
            </div>
          )}

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
            disabled={placing || lines.length === 0 || !user}
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
