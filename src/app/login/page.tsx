import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui";
import { AuthForm } from "./auth-form";
import { siteHref } from "@/lib/hosts";

export const metadata: Metadata = { title: "Sign in", alternates: { canonical: "/login" } };

const NOTICES: Record<string, string> = {
  confirmed: "Email confirmed. Sign in to continue.",
  "link-invalid": "That link has expired or was already used. Sign in, or create your account again.",
  "google-failed": "Google sign-in didn't finish. Try again, or use your email.",
  "slow-down": "Too many sign-in attempts. Wait a minute and try again.",
  "password-reset": "Password changed and every device signed out. Sign in with your new password.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { notice, next } = await searchParams;
  return (
    <main className="grid flex-1 place-items-center px-4 py-12">
      <div className="stagger w-full max-w-sm">
        <Link href={siteHref("/")} className="mb-8 flex justify-center">
          <Logo variant="full" className="h-28" />
        </Link>
        <div className="relative rounded-[10px] border border-t-2 border-border border-t-accent bg-surface-solid p-7">
          <h1 className="relative text-2xl font-semibold tracking-tight">Welcome to Toss</h1>
          <p className="relative mt-1.5 mb-6 text-sm text-secondary">Track your pickups and pay invoices in one place.</p>
          <AuthForm notice={typeof notice === "string" ? NOTICES[notice] : undefined} next={typeof next === "string" ? next : undefined} />
        </div>
      </div>
    </main>
  );
}
