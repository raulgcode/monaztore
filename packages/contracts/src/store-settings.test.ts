import { describe, expect, it } from "vitest";
import {
  domainSchema,
  paymentSettingsSchema,
  paymentsFromForm,
  storeLocaleSchema,
} from "./store-settings";

describe("paymentSettingsSchema", () => {
  it("lets a method that is off stay empty", () => {
    expect(paymentSettingsSchema.safeParse({}).success).toBe(true);
  });
  it("asks for what the shopper needs when a method is on", () => {
    const result = paymentSettingsSchema.safeParse({ sinpeEnabled: "on", transferEnabled: "on" });
    expect(result.error?.issues.map((issue) => [issue.path[0], issue.message])).toEqual([
      ["sinpePhone", "forms.phoneInvalid"],
      ["sinpeHolder", "forms.holderRequired"],
      ["transferBank", "forms.bankRequired"],
      ["transferIban", "forms.ibanInvalid"],
      ["transferHolder", "forms.holderRequired"],
    ]);
  });
  it("keeps the IBAN without spaces and in capitals", () => {
    const result = paymentSettingsSchema.parse({
      transferEnabled: "on",
      transferBank: "BN",
      transferIban: "cr05 0152 0200 1026 2840 66",
      transferHolder: "Tienda",
    });
    expect(paymentsFromForm(result).transfer.iban).toBe("CR05015202001026284066");
  });
});

describe("domainSchema", () => {
  it.each([
    ["MiTienda.com", true],
    ["shop.mitienda.co.cr", true],
    ["https://x.com", false],
    ["local", false],
  ])("%s → %s", (hostname, ok) => {
    expect(domainSchema.safeParse({ hostname }).success).toBe(ok);
  });
});

describe("storeLocaleSchema", () => {
  it("takes a language the store can be in", () => {
    expect(storeLocaleSchema.parse({ locale: "es" })).toEqual({ locale: "es" });
    expect(storeLocaleSchema.safeParse({ locale: "fr" }).success).toBe(false);
  });
});
