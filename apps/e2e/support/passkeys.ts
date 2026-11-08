import type { Page } from "@playwright/test";

/**
 * Gives the page a fingerprint reader: Chromium's virtual authenticator, which says yes to
 * every touch. It keeps its passkeys while the page lives, across sign-outs.
 */
export async function addFingerprintReader(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}
