import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "../lib/current-user";
import { gatewayFetchAsSession } from "../lib/gateway";
import { formatCents, toCents } from "../lib/api";
import type { Order } from "../lib/api";

/**
 * The signed-in customer's order history.
 *
 * The session read and the order fetch are both request-time, so neither can be
 * part of the prerendered shell. Cache Components insists they sit behind a
 * `<Suspense>` boundary, and it is right to: without one, the shell for this
 * route could not be generated at all, so a navigation would block on the
 * server before showing anything.
 *
 * The split below puts the static parts — the heading, the container — in the
 * shell, and streams the orders in. The redirect for a signed-out visitor lives
 * inside the boundary with the data, because "are you signed in" is itself a
 * request-time question.
 */
export default function OrdersPage() {
  return (
    <main className="flex flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-1 border-b border-black/10 pb-6 dark:border-white/15">
        <h1 className="text-2xl font-semibold tracking-tight">My orders</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Everything you have bought through this account.
        </p>
      </header>

      <Suspense fallback={<OrdersSkeleton />}>
        <Orders />
      </Suspense>
    </main>
  );
}

async function Orders() {
  const user = await currentUser();
  if (!user) {
    redirect("/login");
  }

  const orders = await fetchOrders();
  const totalCents = orders.reduce((sum, order) => sum + toCents(order.total), 0);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Placed as {user.email}
        {orders.length > 0 &&
          ` · ${orders.length} ${orders.length === 1 ? "order" : "orders"}, $${formatCents(totalCents)} in total`}
      </p>

      {orders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-black/15 px-4 py-12 text-center text-sm text-zinc-500 dark:border-white/15">
          No orders yet. Anything you buy will show up here.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </ul>
      )}
    </div>
  );
}

function OrderCard({ order }: { order: Order }) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-black/10 p-5 dark:border-white/15">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{formatDate(order.createdAt)}</span>
        <span className="rounded-full bg-black/[.06] px-2 py-0.5 text-xs font-medium capitalize dark:bg-white/10">
          {order.status}
        </span>
      </div>

      <ul className="flex flex-col divide-y divide-black/10 text-sm dark:divide-white/10">
        {order.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-3 py-2">
            <span>
              {item.quantity} × {item.name}
            </span>
            <span className="font-mono tabular-nums">${item.lineTotal}</span>
          </li>
        ))}
      </ul>

      <div className="flex items-baseline justify-between border-t border-black/10 pt-3 dark:border-white/15">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">Total</span>
        <span className="font-mono text-base font-semibold tabular-nums">
          ${order.total}
        </span>
      </div>

      <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
        {order.id}
      </span>
    </li>
  );
}

/** Shown while the session and the orders stream in. */
function OrdersSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="h-5 w-64 rounded bg-black/[.06] dark:bg-white/10" />
      {[0, 1].map((index) => (
        <div
          key={index}
          className="h-32 rounded-xl border border-black/10 dark:border-white/15"
        />
      ))}
    </div>
  );
}

/**
 * The order list, or an empty one if the fetch failed.
 *
 * A failure shows as "no orders" rather than as an error, which is deliberate:
 * the alternative is a page that shouts at a customer because one service was
 * briefly unreachable, over a message they cannot act on. The 401 case cannot
 * arrive here — `currentUser` above already found a user, so a token exists.
 */
async function fetchOrders(): Promise<Order[]> {
  const response = await gatewayFetchAsSession("/orders");
  if (!response?.ok) {
    return [];
  }
  return (await response.json()) as Order[];
}

/** Formats an ISO timestamp for a human, in the server's locale. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
