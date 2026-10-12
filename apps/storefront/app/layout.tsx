import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import UserMenu from "./components/user-menu";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Storefront",
  description: "Product catalog and checkout for the microservices demo",
};

/**
 * The shop's chrome, wrapped around every route.
 *
 * The account corner is a `<UserMenu />` rather than a session read here, and
 * that is a load-bearing choice rather than a tidy one: a top-level `await` on
 * the session in a layout holds the whole segment — `{children}` included —
 * behind that request, so the catalog would wait on identity-service before it
 * could even start. `UserMenu` puts the await behind its own Suspense boundary.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <header className="border-b border-black/10 dark:border-white/15">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
            <Link href="/" className="font-semibold tracking-tight">
              Storefront
            </Link>
            <UserMenu />
          </div>
        </header>

        {children}

        <footer className="border-t border-black/10 dark:border-white/15">
          <div className="mx-auto w-full max-w-6xl px-6 py-6 text-xs text-zinc-500 dark:text-zinc-400">
            A microservices demo — catalog, orders, identity and notifications,
            wired through an api-gateway.
          </div>
        </footer>
      </body>
    </html>
  );
}
