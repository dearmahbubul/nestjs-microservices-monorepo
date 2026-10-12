import { Suspense } from "react";
import { redirect } from "next/navigation";
import AuthForm from "../components/auth-form";
import { currentUser } from "../lib/current-user";

/**
 * Sign-in page.
 *
 * The form is static and belongs in the prerendered shell, so it renders
 * immediately. Only the "already signed in?" check is request-time, so it goes
 * in its own component behind its own boundary and streams in afterwards.
 *
 * Ordering matters here: wrapping the form *inside* the boundary — the obvious
 * reading of "gate the page on the session" — would hold the form behind an
 * identity-service round trip for every visitor, which is the wait the boundary
 * exists to avoid. The check renders nothing; the form is already on screen.
 */
export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <AuthForm mode="login" />
    </main>
  );
}

/**
 * Sends an already-signed-in visitor home.
 *
 * A redirect rather than a gate, and deliberately outside the form's path: the
 * worst case if this is slow is that somebody sees a sign-in form they do not
 * need for a moment. Blocking the form on it would be the worse failure.
 */
async function RedirectIfSignedIn() {
  if (await currentUser()) {
    redirect("/");
  }
  return null;
}
