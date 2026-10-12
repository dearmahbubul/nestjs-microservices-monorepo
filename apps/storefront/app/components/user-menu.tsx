import { Suspense } from "react";
import SessionBar from "./session-bar";
import { currentUser } from "../lib/current-user";

/**
 * The account corner of the header.
 *
 * The session read is in its own component so the `await` sits as deep as it
 * can and behind its own `<Suspense>` boundary. A top-level await in the layout
 * would hold the entire page — including `{children}`, the catalog, everything
 * — behind one identity-service round trip, on every navigation, for a corner
 * of the header that most visitors do not look at.
 *
 * The fallback renders a stable-width placeholder rather than nothing, so the
 * header does not reflow when the answer arrives.
 */
export default function UserMenu() {
  return (
    <Suspense fallback={<div className="h-8 w-32" aria-hidden />}>
      <Resolved />
    </Suspense>
  );
}

async function Resolved() {
  const user = await currentUser();
  return <SessionBar email={user?.email ?? null} />;
}
