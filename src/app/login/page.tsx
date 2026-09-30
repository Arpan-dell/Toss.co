import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui";
import { signInAs } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="grid flex-1 place-items-center px-4 py-12">
      <div className="stagger w-full max-w-sm">
        <Link href="/" className="mb-8 flex justify-center">
          <Logo variant="full" className="h-28" />
        </Link>
        <div className="glass relative overflow-hidden rounded-3xl p-7 shadow-2xl">
          <div aria-hidden className="absolute -top-20 left-1/2 size-48 -translate-x-1/2 rounded-full bg-accent/30 blur-3xl" />
          <h1 className="relative text-2xl font-semibold tracking-tight">Welcome back</h1>
          <p className="relative mt-1.5 text-sm text-secondary">
            Demo mode: pick a role. Email sign-in through Amazon Cognito replaces this in Phase C.
          </p>

          <form action={signInAs} className="relative mt-7 space-y-3">
            <button name="role" value="CUSTOMER" className="btn-primary w-full rounded-full px-4 py-3 text-sm font-medium">
              Continue as customer →
            </button>
            <button name="role" value="MANAGER" className="btn-ghost w-full rounded-full px-4 py-3 text-sm font-medium">
              Continue as laundry manager
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
