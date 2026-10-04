import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

// The picture shown when a Toss link is shared (WhatsApp, Telegram, Google, X). Rendered once at build time.
export const alt = `${SITE_NAME}: laundry that calls its own pickup`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  // white "TOSS" with the teal shirt, made for dark backgrounds
  const logo = await readFile(join(process.cwd(), "public/brand/toss-wordmark.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "linear-gradient(135deg, #0a0f24 0%, #0c1128 55%, #0b2a33 100%)",
          color: "#f5f7fc",
          fontFamily: "sans-serif",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- next/og renders plain <img> only */}
        <img src={logoSrc} width={294} height={144} alt="" />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, maxWidth: 900 }}>Laundry that calls its own pickup.</div>
          <div style={{ marginTop: 22, fontSize: 30, color: "#a9b4d0" }}>A smart basket that books the laundry when it&apos;s full.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 26 }}>
          <div style={{ display: "flex", color: "#02a9a1", fontWeight: 700 }}>tosslaundry.online</div>
          <div style={{ display: "flex", color: "#a9b4d0" }}>Pickup in Delhi · Compare laundries · Pay by UPI</div>
        </div>
      </div>
    ),
    size,
  );
}
