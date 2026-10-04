import type { Metadata, Viewport } from "next";
import { Geist_Mono, Outfit } from "next/font/google";
import { Effects } from "@/components/effects";
import { themeInitScript } from "@/components/theme-toggle";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: { default: `${SITE_NAME}: laundry that calls its own pickup`, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  keywords: ["smart laundry", "laundry pickup", "laundry pickup Delhi", "laundry near me", "wash and fold", "laundry service", "smart laundry basket", "Toss"],
  openGraph: { type: "website", siteName: SITE_NAME, locale: "en_IN", title: `${SITE_NAME}: laundry that calls its own pickup`, description: SITE_DESCRIPTION },
  twitter: { card: "summary_large_image" },
  // Google Search Console's HTML-tag check, if that method is used instead of the DNS record
  verification: process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : undefined,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fc" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning className={`${outfit.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        {/* first thing in <body>, so it still runs before anything paints. Not in a hand-written <head>: chunks
            loaded during hydration are appended to <head>, and React then finds nodes it didn't render there. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <Effects />
        {children}
      </body>
    </html>
  );
}
