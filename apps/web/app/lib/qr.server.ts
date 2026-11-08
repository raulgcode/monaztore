import QRCode from "qrcode";

// Made on the server, so the panel ships no QR library to the browser. Dark on white: phone
// cameras read it best, whatever the panel's theme.
const options = {
  errorCorrectionLevel: "M",
  margin: 2,
  color: { dark: "#111111", light: "#ffffff" },
} as const;

/** The link as an SVG QR code. */
export function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { ...options, type: "svg" });
}
