import { describe, expect, it } from "vitest";
import {
  bpsToPercent,
  defaultCommissionSchema,
  percentToBps,
  readAdminStoreQuery,
  storeCommissionSchema,
} from "./platform-admin";

describe("percentToBps", () => {
  it.each([
    ["3", 300],
    ["2.5", 250],
    ["2,5", 250],
    [" 0 ", 0],
    ["1.25", 125],
  ])("%s → %d", (text, bps) => {
    expect(percentToBps(text)).toBe(bps);
  });

  it.each([[""], ["-1"], ["2.555"], ["abc"], ["100"]])("refuses %s", (text) => {
    expect(percentToBps(text)).toBeNull();
  });

  it("shows basis points as the percent typed", () => {
    expect(bpsToPercent(250)).toBe("2.5");
    expect(bpsToPercent(300)).toBe("3");
  });
});

describe("commission schemas", () => {
  it("refuses more than 20 %", () => {
    const result = defaultCommissionSchema.safeParse({ percent: "25" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("forms.commissionTooHigh");
  });

  it("lets a store follow the platform with an empty percent", () => {
    expect(storeCommissionSchema.parse({})).toEqual({});
    expect(storeCommissionSchema.parse({ percent: "1.5", note: " Socio " })).toEqual({
      percent: "1.5",
      note: "Socio",
    });
  });
});

describe("readAdminStoreQuery", () => {
  it("reads the search and a sane page", () => {
    expect(readAdminStoreQuery(new URLSearchParams("q=%20chiva%20&page=3"))).toEqual({
      q: "chiva",
      page: 3,
    });
    expect(readAdminStoreQuery(new URLSearchParams("page=-2")).page).toBe(1);
    expect(readAdminStoreQuery(new URLSearchParams("page=x")).page).toBe(1);
  });
});
