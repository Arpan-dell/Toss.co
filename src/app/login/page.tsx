import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui";
import { AuthForm } from "./auth-form";
import { LoginBackdrop } from "./login-backdrop";
import { siteHref } from "@/lib/hosts";
import { LanguageToggle, LocaleProvider } from "@/components/locale";
import { translator } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  confirmed: "Email confirmed. Sign in to continue.",
  "link-invalid": "That link has expired or was already used. Sign in, or create your account again.",
  "google-failed": "Google sign-in didn't finish. Try again, or use your email.",
  "slow-down": "Too many sign-in attempts. Wait a minute and try again.",
  "password-reset": "Password changed and every device signed out. Sign in with your new password.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const [{ notice, next }, locale] = await Promise.all([searchParams, getLocale()]);
  const t = translator(locale);
  const said = typeof notice === "string" ? NOTICES[notice] : undefined;
  return (
    <LocaleProvider locale={locale}>
    <main id="main" tabIndex={-1} className="outline-none relative isolate grid min-h-[100dvh] flex-1 place-items-center px-4 py-10">
      <LoginBackdrop />
      <div className="absolute top-4 right-4 z-20">
        <LanguageToggle />
      </div>
      <AuthForm
        notice={said ? t(said) : undefined}
        next={typeof next === "string" ? next : undefined}
        logo={
          <Link href={siteHref("/")} aria-label="Toss home" className="w-fit">
            <Logo className="h-10" />
          </Link>
        }
      />
    </main>
    </LocaleProvider>
  );
}
