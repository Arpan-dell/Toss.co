import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui";
import { AuthForm } from "./auth-form";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  confirmed: "Email confirmed. Sign in to continue.",
  "link-invalid": "That link has expired or was already used. Sign in, or create your account again.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { notice } = await searchParams;
  return (
    <main className="grid flex-1 place-items-center px-4 py-12">
      <div className="stagger w-full max-w-sm">
        <Link href="/" className="mb-8 flex justify-center">
          <Logo variant="full" className="h-28" />
        </Link>
        <div className="glass relative overflow-hidden rounded-3xl p-7 shadow-2xl">
          <div aria-hidden className="absolute -top-20 left-1/2 size-48 -translate-x-1/2 rounded-full bg-accent/30 blur-3xl" />
          <h1 className="relative text-2xl font-semibold tracking-tight">Welcome to Toss</h1>
          <p className="relative mt-1.5 mb-6 text-sm text-secondary">Track your pickups and pay invoices in one place.</p>
          <AuthForm notice={typeof notice === "string" ? NOTICES[notice] : undefined} />
        </div>
      </div>
    </main>
  );
}
