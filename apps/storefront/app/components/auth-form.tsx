"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, login, register } from "../lib/api";

/** Shortest password identity-service will accept, mirrored for early feedback. */
const MIN_PASSWORD_LENGTH = 8;

type Mode = "login" | "register";

const COPY: Record<
  Mode,
  {
    title: string;
    blurb: string;
    submit: string;
    busy: string;
    /** Rendered under the button, as a link to the other mode. */
    switchPrompt: string;
    switchLabel: string;
    switchHref: string;
  }
> = {
  login: {
    title: "Sign in",
    blurb: "Sign in to check out with your saved details and see your orders.",
    submit: "Sign in",
    busy: "Signing in…",
    switchPrompt: "New here?",
    switchLabel: "Create an account",
    switchHref: "/register",
  },
  register: {
    title: "Create an account",
    blurb: "One account for checkout and your order history.",
    submit: "Create account",
    busy: "Creating your account…",
    switchPrompt: "Already have an account?",
    switchLabel: "Sign in",
    switchHref: "/login",
  },
};

/**
 * The sign-in and sign-up form.
 *
 * One component for both modes rather than two pages: the fields, the
 * validation and the error handling are identical, and the only real
 * differences are the verb and which endpoint is called. Copying it would mean
 * every future fix to the password rule landing in two places.
 *
 * `onDone` and the redirect are the caller's choice, so this can be dropped
 * into a page that returns the visitor somewhere specific after signing in.
 */
export default function AuthForm({
  mode,
  redirectTo = "/",
}: {
  mode: Mode;
  redirectTo?: string;
}) {
  const router = useRouter();
  const copy = COPY[mode];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmed = email.trim();
    if (trimmed === "" || password === "") {
      setError("Enter your email and password.");
      return;
    }
    // Only checked on the way in. On the way out the server is the authority,
    // and telling a returning customer their stored password is too short would
    // be a puzzle rather than a help.
    if (mode === "register" && password.length < MIN_PASSWORD_LENGTH) {
      setError(`Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setBusy(true);
    try {
      await (mode === "register"
        ? register(trimmed, password)
        : login(trimmed, password));
      // The cookie was set by the route handler, so the destination can read
      // the session immediately. `refresh` re-renders it from the server
      // instead of serving the signed-out version from the client cache.
      router.replace(redirectTo);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex w-full max-w-sm flex-col gap-5 rounded-xl border border-black/10 p-6 dark:border-white/15"
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{copy.title}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{copy.blurb}</p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300"
        >
          {error}
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">Email</span>
        <input
          type="email"
          required
          autoFocus
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">Password</span>
        <input
          type="password"
          required
          minLength={mode === "register" ? MIN_PASSWORD_LENGTH : undefined}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={inputClass}
        />
      </label>

      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        {busy ? copy.busy : copy.submit}
      </button>

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {copy.switchPrompt}{" "}
        <Link
          href={copy.switchHref}
          className="font-medium text-foreground underline underline-offset-2"
        >
          {copy.switchLabel}
        </Link>
      </p>
    </form>
  );
}

const inputClass =
  "rounded-lg border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/50 dark:border-white/20 dark:focus:border-white/60";
