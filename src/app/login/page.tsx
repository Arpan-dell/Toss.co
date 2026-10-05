import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui";
import { AuthForm } from "./auth-form";
import { LoginBackdrop } from "./login-backdrop";
import { siteHref } from "@/lib/hosts";

export const metadata: Metadata = { title: "Sign in" };

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
    <main className="relative isolate grid min-h-[100dvh] flex-1 place-items-center px-4 py-10">
      <LoginBackdrop />
      <AuthForm
        notice={typeof notice === "string" ? NOTICES[notice] : undefined}
        next={typeof next === "string" ? next : undefined}
        logo={
          <Link href={siteHref("/")} aria-label="Toss home" className="w-fit">
            <Logo className="h-10" />
          </Link>
        }
      />
    </main>
  );
}
