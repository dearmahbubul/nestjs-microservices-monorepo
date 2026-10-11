"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  createProduct,
  deleteProduct,
  isUnauthorized,
  listProducts,
  updateProduct,
  type Product,
  type ProductInput,
} from "../lib/api";

interface FormState {
  /** null = creating; otherwise the id being edited. */
  id: string | null;
  name: string;
  price: string;
  stock: string;
}

const EMPTY_FORM: FormState = { id: null, name: "", price: "", stock: "0" };

export default function ProductsManager() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Bumped to re-run the fetch effect: initial mount, refresh, after a write. */
  const [reloadKey, setReloadKey] = useState(0);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Data fetching lives in an effect, but every state update happens inside the
  // async continuation — never synchronously in the effect body — so it cannot
  // trigger the cascading-render loop that `react-hooks/set-state-in-effect`
  // warns about. `reloadKey` is the single trigger for (re)loading.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await listProducts();
        if (cancelled) return;
        setProducts(data);
        setLoadError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }
        // Handled inline rather than via `handleUnauthorized` so the effect
        // depends only on `router`, which is already in its dependency list.
        if (isUnauthorized(error)) {
          router.replace("/login");
          return;
        }
        setLoadError(messageOf(error));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, router]);

  /**
   * Sends the operator back to the login screen when a call comes back 401 —
   * the session expired while the panel was open. Returns true if it handled
   * the error, so callers can fall through to their own message otherwise.
   */
  function handleUnauthorized(error: unknown): boolean {
    if (!isUnauthorized(error)) {
      return false;
    }
    router.replace("/login");
    return true;
  }

  function reload() {
    setLoading(true);
    setReloadKey((key) => key + 1);
  }

  const editing = form.id !== null;

  function startCreate() {
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  function startEdit(product: Product) {
    setForm({
      id: product.id,
      name: product.name,
      price: product.price,
      stock: String(product.stock),
    });
    setFormError(null);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const name = form.name.trim();
    if (name === "") {
      setFormError("Name is required.");
      return;
    }
    const price = Number(form.price);
    if (form.price.trim() === "" || !Number.isFinite(price) || price < 0) {
      setFormError("Price must be a non-negative number.");
      return;
    }
    const stock = Number(form.stock);
    if (!Number.isInteger(stock) || stock < 0) {
      setFormError("Stock must be a whole number, 0 or more.");
      return;
    }

    const input: ProductInput = { name, price: form.price.trim(), stock };
    setSaving(true);
    try {
      if (editing) {
        await updateProduct(form.id!, input);
      } else {
        await createProduct(input);
      }
      setForm(EMPTY_FORM);
      reload();
    } catch (error) {
      if (handleUnauthorized(error)) {
        return;
      }
      setFormError(messageOf(error));
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(product: Product) {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) {
      return;
    }
    setDeletingId(product.id);
    setLoadError(null);
    try {
      await deleteProduct(product.id);
      // If the deleted row was the one open in the form, drop the edit state.
      if (form.id === product.id) {
        setForm(EMPTY_FORM);
      }
      reload();
    } catch (error) {
      if (handleUnauthorized(error)) {
        return;
      }
      setLoadError(messageOf(error));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      {/* ---------------------------------------------------------- list */}
      <section className="min-w-0">
        <header className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Products</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {loading ? "Loading…" : `${products.length} in catalog`}
            </p>
          </div>
          <button
            type="button"
            onClick={reload}
            disabled={loading}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Refresh
          </button>
        </header>

        {loadError && (
          <div
            role="alert"
            className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          >
            {loadError}
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 text-right font-medium">Price</th>
                <th className="px-4 py-3 text-right font-medium">Stock</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {products.map((product) => (
                <tr
                  key={product.id}
                  className={
                    form.id === product.id
                      ? "bg-blue-50 dark:bg-blue-950/40"
                      : "bg-white dark:bg-zinc-950"
                  }
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{product.name}</div>
                    <div className="font-mono text-xs text-zinc-400">
                      {product.id}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {product.price}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <StockBadge stock={product.stock} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(product)}
                        className="rounded-md border border-zinc-300 px-3 py-1 text-xs font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDelete(product)}
                        disabled={deletingId === product.id}
                        className="rounded-md border border-red-300 px-3 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950"
                      >
                        {deletingId === product.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && products.length === 0 && !loadError && (
                <tr className="bg-white dark:bg-zinc-950">
                  <td
                    colSpan={4}
                    className="px-4 py-10 text-center text-zinc-500 dark:text-zinc-400"
                  >
                    No products yet. Create the first one with the form.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------------------------------------------------- form */}
      <section className="lg:sticky lg:top-8 lg:self-start">
        <form
          onSubmit={onSubmit}
          className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {editing ? "Edit product" : "New product"}
            </h2>
            {editing && (
              <button
                type="button"
                onClick={startCreate}
                className="text-sm text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
              >
                Cancel
              </button>
            )}
          </div>

          {formError && (
            <div
              role="alert"
              className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
            >
              {formError}
            </div>
          )}

          <div className="space-y-4">
            <Field label="Name" htmlFor="product-name">
              <input
                id="product-name"
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="Mechanical Keyboard"
                className={inputClass}
                autoComplete="off"
              />
            </Field>

            <Field label="Price" htmlFor="product-price">
              <input
                id="product-price"
                value={form.price}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, price: event.target.value }))
                }
                placeholder="129.99"
                inputMode="decimal"
                className={`${inputClass} font-mono`}
                autoComplete="off"
              />
            </Field>

            <Field label="Stock" htmlFor="product-stock">
              <input
                id="product-stock"
                value={form.stock}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, stock: event.target.value }))
                }
                inputMode="numeric"
                className={`${inputClass} font-mono`}
                autoComplete="off"
              />
            </Field>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="mt-6 w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {saving
              ? "Saving…"
              : editing
                ? "Save changes"
                : "Create product"}
          </button>
        </form>
      </section>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-500";

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function StockBadge({ stock }: { stock: number }) {
  const tone =
    stock === 0
      ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
      : stock < 10
        ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
        : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";

  return (
    <span
      className={`inline-block min-w-10 rounded-full px-2 py-0.5 font-mono text-xs tabular-nums ${tone}`}
    >
      {stock}
    </span>
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
