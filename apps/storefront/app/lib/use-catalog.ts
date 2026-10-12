"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { countProducts, listProducts, type Product } from "./api";

/** How many products to fetch per scroll. */
export const PAGE_SIZE = 12;

export interface Catalog {
  products: Product[];
  /** Total rows, once known. `null` until the first page resolves. */
  total: number | null;
  /** A page request is in flight. */
  loading: boolean;
  /** Every page so far loaded; nothing more to fetch. */
  done: boolean;
  error: string | null;
  /** Ask for the next page. Safe to call repeatedly — re-entrant calls no-op. */
  loadMore: () => void;
  /** Start over from the first page. Clears and refetches. */
  reload: () => void;
  /**
   * Bumped by `reload`. The sentinel's scroll observer is keyed on this, so a
   * reload re-arms it — otherwise a visitor who had already scrolled to the
   * bottom would sit on an empty catalog with an observer that had fired and
   * disconnected long ago.
   */
  generation: number;
}

/**
 * Paginated catalog state, driven by an explicit `loadMore` rather than by an
 * effect that watches a sentinel.
 *
 * The separation matters. A hook that fetched whenever "in view" became true
 * couples two questions — *has the visitor scrolled far enough* (a DOM fact)
 * and *is there another page* (a server fact) — and the bugs live in the seam:
 * fetching past the end, firing two requests for the same offset, or losing a
 * race where a slow page 2 resolves after a fast page 3 and is appended out of
 * order. Here the DOM fact arrives as a `loadMore()` call and all the ordering
 * rules live in one place.
 *
 * Ordering is enforced by `offsetRef`, not by `products.length`. State updates
 * are asynchronous, so two calls before a re-render would both read the same
 * length and request the same page; the ref advances synchronously and the
 * in-flight guard drops the second call outright.
 */
export function useCatalog(): Catalog {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);

  /** Next offset to request. Synchronous, so it cannot be double-read. */
  const offsetRef = useRef(0);
  /** In-flight guard: one request at a time, always. */
  const inFlightRef = useRef(false);
  /** True once the server has told us there is nothing past `total`. */
  const exhaustedRef = useRef(false);
  /**
   * Aborts the current page when the catalog is reset or the component goes
   * away, so a stale page cannot land after a `reload()` has cleared the list.
   */
  const abortRef = useRef<AbortController | null>(null);

  const loadMore = useCallback(() => {
    if (inFlightRef.current || exhaustedRef.current) {
      return;
    }
    inFlightRef.current = true;
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const offset = offsetRef.current;

    void (async () => {
      try {
        // The count is fetched alongside the first page and cached in state;
        // it is a second round trip only on the very first load.
        const [page, count] = await Promise.all([
          listProducts({ limit: PAGE_SIZE, offset }, controller.signal),
          total === null ? countProducts(controller.signal) : Promise.resolve(null),
        ]);
        if (controller.signal.aborted) {
          return;
        }

        if (count !== null) {
          setTotal(count);
        }

        // Advance by what we asked for, not by what came back: the server is
        // entitled to return a short page (a product deleted mid-scroll), and
        // re-requesting the same offset would loop on that product forever.
        offsetRef.current = offset + PAGE_SIZE;

        setProducts((previous) => [...previous, ...page]);
        setError(null);

        const knownTotal = count ?? total;
        if (
          page.length === 0 ||
          (knownTotal !== null && offset + page.length >= knownTotal)
        ) {
          exhaustedRef.current = true;
        }
      } catch (cause) {
        if (controller.signal.aborted) {
          return;
        }
        setError(
          cause instanceof Error ? cause.message : "Something went wrong.",
        );
        // Let the visitor retry the same page rather than skipping it: leave
        // the offset where it is and drop the in-flight guard.
      } finally {
        if (!controller.signal.aborted) {
          inFlightRef.current = false;
          setLoading(false);
        }
      }
    })();
  }, [total]);

  const reload = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    inFlightRef.current = false;
    exhaustedRef.current = false;
    offsetRef.current = 0;
    setProducts([]);
    setTotal(null);
    setError(null);
    setLoading(false);
    // Bumping the generation remounts the sentinel and restarts the scroll.
    setGeneration((value) => value + 1);
  }, []);

  // The first page, once, on mount. Every later page is driven by `loadMore`.
  useEffect(() => {
    loadMore();
    return () => {
      abortRef.current?.abort();
    };
    // `loadMore` changes identity when `total` updates, which would refetch the
    // catalog every time the count is learned. The mount is the intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    products,
    total,
    loading,
    done: exhaustedRef.current,
    error,
    loadMore,
    reload,
    generation,
  };
}
