import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: { default: "Toss — laundry that calls its own pickup", template: "%s · Toss" },
  description: "Smart baskets that order their own laundry pickup.",
};

export const viewport: Viewport = { themeColor: "#050507" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <div className="aurora" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        {children}
      </body>
    </html>
  );
}
