import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Geist_Mono, Noto_Sans_Devanagari, Outfit } from "next/font/google";
import { Effects } from "@/components/effects";
import { CookieNotice } from "@/components/cookie-notice";
import { themeInitScript } from "@/components/theme-toggle";
import { LANG_COOKIE } from "@/lib/i18n";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
});

// Hindi: Outfit has no Devanagari letters, so Hindi text falls through to this (see --font-sans in globals.css).
// Only downloaded when a page actually shows Devanagari, thanks to the font's unicode-range.
const devanagari = Noto_Sans_Devanagari({
  variable: "--font-devanagari",
  subsets: ["devanagari"],
  weight: ["400", "500", "600", "700"],
  preload: false,
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
    { media: "(prefers-color-scheme: light)", color: "#f1eee8" },
    { media: "(prefers-color-scheme: dark)", color: "#100e0c" },
  ],
};

// <html lang> for screen readers and the browser's own translate offer: Hindi when the page is in Hindi. Set here
// before paint because this layout is static and can't read the cookie.
const langInitScript = `try{if(/(?:^|; )${LANG_COOKIE}=hi(?:;|$)/.test(document.cookie)||(location.pathname+"/").indexOf("/hi/")===0)document.documentElement.lang="hi"}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning className={`${outfit.variable} ${devanagari.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        {/* first thing in <body>, so it still runs before anything paints. Not in a hand-written <head>: chunks
            loaded during hydration are appended to <head>, and React then finds nodes it didn't render there. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript + langInitScript }} />
        <Effects />
        {/* keyboard and screen-reader users jump straight past the navigation */}
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
        <CookieNotice />
        {/* cookie-free page counts (Vercel Web Analytics): no personal data, no cross-site tracking; see the Privacy Policy */}
        <Analytics />
      </body>
    </html>
  );
}
