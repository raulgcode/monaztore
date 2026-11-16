import { describe, expect, it } from "vitest";
import {
  freeShippingNote,
  pickShippingOption,
  shippingFromForm,
  shippingOptions,
  shippingSettingsSchema,
  shippingToForm,
} from "./shipping";

const correos = { id: "c", name: "Correos", price: 250_000, freeFrom: 2_000_000, pickup: false };
const pickup = { id: "p", name: "Retiro", price: 0, freeFrom: null, pickup: true };

describe("shippingOptions", () => {
  it("prices each option for the cart and makes it free once the cart reaches its amount", () => {
    expect(shippingOptions([correos, pickup], 1_999_999)).toEqual([
      { id: "c", name: "Correos", price: 250_000, free: false, freeFrom: 2_000_000, pickup: false },
      { id: "p", name: "Retiro", price: 0, free: false, freeFrom: null, pickup: true },
    ]);
    expect(shippingOptions([correos], 2_000_000)[0]).toMatchObject({ price: 0, free: true });
  });

  it("picks only one of the store's options", () => {
    const options = shippingOptions([correos, pickup], 0);
    expect(pickShippingOption(options, "p")?.name).toBe("Retiro");
    expect(pickShippingOption(options, "x")).toBeNull();
    expect(pickShippingOption(options, "")).toBeNull();
  });
});

describe("the shipping form", () => {
  it("turns the rows into options with prices in minor units, giving new ones an id", () => {
    const parsed = shippingSettingsSchema.parse({
      methods: [
        { id: "c", name: "Correos", price: "2500", freeFrom: "20000" },
        { name: "Retiro", price: "0", pickup: "on" },
      ],
    });
    expect(shippingFromForm(parsed, () => "new")).toEqual({
      methods: [correos, { ...pickup, id: "new" }],
    });
  });

  it("asks for a name and a price, and shows the saved options again", () => {
    const result = shippingSettingsSchema.safeParse({ methods: [{ name: "", price: "abc" }] });
    expect(result.success).toBe(false);
    expect(shippingToForm({ methods: [correos] })).toEqual({
      methods: [{ id: "c", name: "Correos", price: "2500", freeFrom: "20000", pickup: "" }],
    });
  });
});

describe("freeShippingNote", () => {
  const methods = [
    { id: "courier", name: "Courier", price: 250_000, freeFrom: 3_000_000, pickup: false },
    { id: "pickup", name: "Pickup", price: 0, freeFrom: null, pickup: true },
  ];

  it("says how much is left to the courier's free shipping", () => {
    expect(freeShippingNote(shippingOptions(methods, 1_000_000), 1_000_000)).toEqual({
      kind: "left",
      name: "Courier",
      left: 2_000_000,
    });
  });

  it("says it ships free once the cart reaches it", () => {
    expect(freeShippingNote(shippingOptions(methods, 3_000_000), 3_000_000)).toEqual({
      kind: "free",
      name: "Courier",
    });
  });

  it("says nothing when no option is ever free", () => {
    const paid = [{ ...methods[0], freeFrom: null }] as typeof methods;
    expect(freeShippingNote(shippingOptions(paid, 1_000_000), 1_000_000)).toBeNull();
  });
});
