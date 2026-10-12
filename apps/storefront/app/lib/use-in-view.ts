"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Watches one element and reports when it scrolls into view.
 *
 * Returns a `[ref, inView]` pair. The ref goes on a sentinel at the end of a
 * list; `inView` flips to `true` once the sentinel has been seen. That is the
 * whole mechanism behind autoloading — the sentinel is the last thing in the
 * scroller, so "the sentinel is visible" means "the visitor has reached the end
 * of what we have".
 *
 * The element is observed afresh every time `key` changes, and `inView` resets
 * with it. That combination is what makes it safe to use in a loop:
 *
 *   1. The sentinel becomes visible, `inView` flips true, the caller fetches.
 *   2. The caller appends rows and bumps `key`, which remounts the sentinel
 *      below the new content.
 *   3. The observer re-attaches to the new node and `inView` goes back to
 *      false, so the caller does not immediately fire again on the same
 *      intersection.
 *
 * Without step 3 the appended rows would re-trigger the callback and the
 * catalog would load itself to the end the first time anybody scrolled.
 *
 * One observer is created per key and is disconnected on cleanup, so a fast
 * scroller never accumulates observers on detached nodes.
 */
export function useInView(
  key: number | string,
  { rootMargin = "600px" }: { rootMargin?: string } = {},
): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    // Reset before observing: the new node is almost certainly still in view
    // from the previous page, and leaving `inView` true would make the caller
    // treat a stale "visible" as a fresh request.
    setInView(false);

    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      // No observer — an old browser, or a test environment. Report visible so
      // the caller loads everything eagerly: slow, but correct. Reporting
      // "not visible" would leave the catalog stuck on page one forever.
      setInView(true);
      return;
    }

    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (cancelled) {
          return;
        }
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
        }
      },
      { rootMargin },
    );

    observer.observe(element);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [key, rootMargin]);

  return [ref, inView];
}
