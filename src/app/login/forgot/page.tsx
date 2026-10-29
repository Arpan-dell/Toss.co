import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/ui";
import { ForgotForm } from "./form";
import { siteHref } from "@/lib/hosts";
import { LocaleProvider } from "@/components/locale";
import { translator } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false } };

export default async function ForgotPasswordPage() {
  const locale = await getLocale();
  const t = translator(locale);
  return (
    <LocaleProvider locale={locale}>
    <main id="main" tabIndex={-1} className="outline-none grid flex-1 place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Link href={siteHref("/")} className="mb-8 flex justify-center">
          <Logo variant="full" className="h-28" />
        </Link>
        <div className="rounded-[10px] border border-t-2 border-border border-t-accent bg-surface-solid p-7">
          <h1 className="text-2xl font-semibold tracking-tight">{t("Forgot your password?")}</h1>
          <p className="mt-1.5 mb-6 text-sm text-secondary">{t("Enter your account email and we'll send a link to choose a new one.")}</p>
          <ForgotForm />
          <Link href="/login" className="mt-5 inline-block text-sm text-accent hover:underline">
            ← {t("Back to sign in")}
          </Link>
        </div>
      </div>
    </main>
    </LocaleProvider>
  );
}
