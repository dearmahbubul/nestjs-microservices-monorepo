"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { logout } from "../lib/api";

/**
 * Shows who is signed in and offers a way out.
 *
 * The email is passed down from the server component, which resolved it from
 * identity-service — the client never reads the token to work it out.
 */
export default function SessionBar({ email }: { email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await logout();
      router.replace("/login");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-zinc-500 dark:text-zinc-400">{email}</span>
      <button
        type="button"
        onClick={() => void signOut()}
        disabled={busy}
        className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
