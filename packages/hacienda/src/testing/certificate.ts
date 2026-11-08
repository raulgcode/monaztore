import forge from "node-forge";

/**
 * A self-signed .p12 like the one Hacienda hands out in ATV, for tests: RSA 2048, one year.
 * Generating the key takes a moment, so tests make it once.
 */
export function testCertificate(
  pin = "1234",
  { name = "PRUEBA MONAZTORE", days = 365 }: { name?: string; days?: number } = {},
): Buffer {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const certificate = forge.pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = "01";
  const now = new Date();
  certificate.validity.notBefore = new Date(now.getTime() - 60_000);
  certificate.validity.notAfter = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  const subject = [
    { name: "commonName", value: name },
    { name: "countryName", value: "CR" },
  ];
  certificate.setSubject(subject);
  certificate.setIssuer(subject);
  certificate.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [certificate], pin, {
    algorithm: "3des",
  });
  return Buffer.from(forge.asn1.toDer(p12).getBytes(), "binary");
}
