import { Suspense } from "react";
import { redirect } from "next/navigation";
import AuthForm from "../components/auth-form";
import { currentUser } from "../lib/current-user";

/**
 * Sign-up page. Shaped like `/login` and for the same reason: the form is
 * static and renders from the shell, while the "already signed in?" check
 * streams in beside it rather than in front of it.
 */
export default function RegisterPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <AuthForm mode="register" />
    </main>
  );
}

async function RedirectIfSignedIn() {
  if (await currentUser()) {
    redirect("/");
  }
  return null;
}
