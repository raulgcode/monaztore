import { X509Certificate } from "node:crypto";
import { loadP12, signXml, validateDocumentXml } from "@dojocoding/hacienda-sdk";

/** What the store sees about its signing key (the .p12 Hacienda gives in ATV). */
export interface CertificateInfo {
  subject: string;
  expiresAt: Date;
}

/**
 * Opens the key with its PIN. Throws `CertificateError` when the PIN is wrong, the file isn't a
 * .p12, or it has expired.
 */
export async function readCertificate(
  p12: Buffer,
  pin: string,
  now = new Date(),
): Promise<CertificateInfo> {
  let pem: string;
  try {
    pem = (await loadP12(p12, pin)).certificatePem;
  } catch {
    throw new CertificateError("unreadable");
  }
  const certificate = new X509Certificate(pem);
  const expiresAt = new Date(certificate.validTo);
  if (expiresAt <= now) throw new CertificateError("expired");
  const subject =
    certificate.subject
      .split("\n")
      .find((part) => part.startsWith("CN="))
      ?.slice(3) ?? certificate.subject;
  return { subject, expiresAt };
}

export class CertificateError extends Error {
  constructor(readonly reason: "unreadable" | "expired") {
    super(reason === "expired" ? "The certificate has expired" : "Wrong PIN or not a .p12 file");
  }
}

/**
 * Signs with XAdES-EPES (Hacienda's policy) and checks the result against the official v4.4
 * schema, so a document that Hacienda would refuse for its shape never leaves.
 */
export async function signComprobante(xml: string, p12: Buffer, pin: string): Promise<string> {
  const signed = await signXml(xml, p12, pin);
  const result = await validateDocumentXml(signed, { requireSignature: true });
  if (!result.valid) throw new Error(`Invalid v4.4 document: ${result.issues.join("; ")}`);
  return signed;
}

/** Checks an unsigned document against the v4.4 schema. */
export async function validateComprobante(xml: string): Promise<string[]> {
  const result = await validateDocumentXml(xml);
  return result.valid ? [] : [...result.issues];
}
