"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { logout } from "../lib/api";

/**
 * The header's account corner: who is signed in, or a way in.
 *
 * The email is passed down from the server component that resolved it, so the
 * client never reads the token to work it out.
 */
export default function SessionBar({ email }: { email: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (!email) {
    return (
      <div className="flex items-center gap-3">
        <Link
          href="/login"
          className="text-sm font-medium underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="rounded-full border border-black/10 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/15 dark:hover:bg-white/[.08]"
        >
          Create account
        </Link>
      </div>
    );
  }

  async function signOut() {
    setBusy(true);
    try {
      await logout();
      router.replace("/");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Link
        href="/orders"
        className="text-sm font-medium underline-offset-4 hover:underline"
      >
        My orders
      </Link>
      <span className="hidden text-sm text-zinc-500 sm:inline dark:text-zinc-400">
        {email}
      </span>
      <button
        type="button"
        onClick={() => void signOut()}
        disabled={busy}
        className="rounded-full border border-black/10 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/[.08]"
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
