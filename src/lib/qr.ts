import "server-only";
import QRCode from "qrcode";

// QR codes are rendered on the server as inline SVG: no third-party QR service sees payment details.
export function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#0b0b0b", light: "#ffffff" },
  });
}
