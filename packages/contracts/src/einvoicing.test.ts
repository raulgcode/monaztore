import { describe, expect, it } from "vitest";
import {
  cleanTaxId,
  einvoicingCredentialsSchema,
  einvoicingIssuerSchema,
  einvoicingOptionsSchema,
  haciendaEnvironmentOf,
  invoiceToSchema,
  taxIdFromForm,
  taxIdTypeOf,
} from "./einvoicing";

describe("Costa Rican IDs", () => {
  it("tells physical, company, DIMEX and NITE apart, without dashes or spaces", () => {
    expect(cleanTaxId(" 1-1234-0567 ")).toBe("112340567");
    expect(taxIdTypeOf("112340567")).toBe("01");
    expect(taxIdTypeOf("3101123456")).toBe("02");
    expect(taxIdTypeOf("155812345678")).toBe("03");
    expect(taxIdTypeOf("4000123456")).toBe("04");
    expect(taxIdTypeOf("12345")).toBeUndefined();
  });
});

describe("the issuer's details", () => {
  const issuer = {
    idNumber: "3-101-123456",
    name: "Tienda Bonita S.A.",
    email: "facturas@bonita.cr",
    activityCode: "478201",
    district: "1-01-01",
    address: "100 m norte de la iglesia",
  };
  it("takes a complete issuer and cleans the ID", () => {
    const parsed = einvoicingIssuerSchema.safeParse(issuer);
    expect(parsed.success && parsed.data.idNumber).toBe("3101123456");
  });
  it("refuses an activity that isn't 6 digits and a district that isn't one", () => {
    const parsed = einvoicingIssuerSchema.safeParse({
      ...issuer,
      activityCode: "47",
      district: "x",
    });
    expect(parsed.success).toBe(false);
    const paths = parsed.error?.issues.map((issue) => issue.path[0]);
    expect(paths).toEqual(expect.arrayContaining(["activityCode", "district"]));
  });
});

describe("Hacienda's API user", () => {
  it("knows the sandbox from production by the user's domain", () => {
    expect(haciendaEnvironmentOf("cpj-3-101-123456@stag.comprobanteselectronicos.go.cr")).toBe(
      "sandbox",
    );
    expect(haciendaEnvironmentOf("cpj-3-101-123456@prod.comprobanteselectronicos.go.cr")).toBe(
      "production",
    );
  });
  it("refuses a user from anywhere else, and a PIN that isn't 4 digits", () => {
    const parsed = einvoicingCredentialsSchema.safeParse({
      haciendaUsername: "ana@gmail.com",
      certificatePin: "12a4",
    });
    const paths = parsed.error?.issues.map((issue) => issue.path[0]);
    expect(paths).toEqual(expect.arrayContaining(["haciendaUsername", "certificatePin"]));
  });
});

describe("numbering options", () => {
  it("reads the checkbox and the numbers typed", () => {
    const parsed = einvoicingOptionsSchema.safeParse({
      autoIssue: "on",
      branch: "2",
      terminal: "15",
    });
    expect(parsed.success && parsed.data).toEqual({ autoIssue: true, branch: 2, terminal: 15 });
  });
  it("refuses zero and numbers too long for the consecutive", () => {
    expect(einvoicingOptionsSchema.safeParse({ branch: "0", terminal: "1" }).success).toBe(false);
    expect(einvoicingOptionsSchema.safeParse({ branch: "1000", terminal: "1" }).success).toBe(
      false,
    );
  });
});

describe("invoice in my name", () => {
  it("both empty is a receipt", () => {
    const parsed = invoiceToSchema.safeParse({});
    expect(parsed.success && taxIdFromForm(parsed.data)).toBeNull();
  });
  it("an ID and a name are an invoice to them", () => {
    const parsed = invoiceToSchema.safeParse({ taxIdNumber: "1 1234 0567", taxName: "Ana Mora" });
    expect(parsed.success && taxIdFromForm(parsed.data)).toEqual({
      idType: "01",
      idNumber: "112340567",
      name: "Ana Mora",
    });
  });
  it("a name without an ID, or an ID that isn't one, is an error", () => {
    const parsed = invoiceToSchema.safeParse({ taxIdNumber: "123", taxName: "" });
    const paths = parsed.error?.issues.map((issue) => issue.path[0]);
    expect(paths).toEqual(expect.arrayContaining(["taxIdNumber", "taxName"]));
  });
});
