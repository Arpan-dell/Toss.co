import type { Metadata, Viewport } from "next";
import { Geist_Mono, Outfit } from "next/font/google";
import { Effects } from "@/components/effects";
import { themeInitScript } from "@/components/theme-toggle";
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
  metadataBase: new URL(process.env.SITE_URL ?? "https://tosslaundry.online"),
  title: { default: "Toss: laundry that calls its own pickup", template: "%s · Toss" },
  description: "Smart baskets that order their own laundry pickup.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fc" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1128" },
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
