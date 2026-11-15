import { z } from "zod/mini";
import { minorToPrice, priceToMinor } from "./digital-products";
import { message } from "./message";

// How a store delivers: a few options it names itself ("Correos de Costa Rica", "Mensajería en
// la GAM", "Retiro en la tienda"), each with its price and, optionally, free from an amount. The
// shopper picks one at checkout; an option for picking up asks for no address. A store with no
// options charges nothing for shipping (what every store did before).

export const SHIPPING_METHODS_MAX = 8;

/** One option as the store keeps it (`store_settings.shipping.methods`). Prices in minor units. */
export interface ShippingMethod {
  id: string;
  name: string;
  price: number;
  /** Free when the cart (after its coupon) reaches this; null = never free. */
  freeFrom: number | null;
  /** Picked up by the shopper: no address. */
  pickup: boolean;
}

export interface StoreShipping {
  methods?: ShippingMethod[];
}

/** One option as the shopper sees it for their cart: its price for this cart. */
export interface ShippingOption {
  id: string;
  name: string;
  price: number;
  /** Free only because the cart reached `freeFrom`. */
  free: boolean;
  /** The amount from which it's free, to say so while the cart is below it. */
  freeFrom: number | null;
  pickup: boolean;
}

/** The store's options for a cart worth `amount` (after its coupon), in the store's order. */
export function shippingOptions(
  methods: readonly ShippingMethod[],
  amount: number,
): ShippingOption[] {
  return methods.map((method) => {
    const free = method.freeFrom !== null && method.price > 0 && amount >= method.freeFrom;
    return {
      id: method.id,
      name: method.name,
      price: free ? 0 : method.price,
      free,
      freeFrom: method.freeFrom,
      pickup: method.pickup,
    };
  });
}

/** The option the shopper picked, if it's one of the store's. */
export function pickShippingOption(
  options: readonly ShippingOption[],
  id: string | null | undefined,
): ShippingOption | null {
  return options.find((option) => option.id === id) ?? null;
}

const price = (required: boolean) =>
  z._default(
    z.string().check(
      z.trim(),
      z.refine(
        (value) => (value === "" ? !required : (priceToMinor(value) ?? -1) >= 0),
        message("forms.priceInvalid"),
      ),
    ),
    "",
  );

const methodFields = z.object({
  id: z._default(z.string().check(z.trim(), z.maxLength(40)), ""),
  name: z
    .string({ error: message("forms.shippingNameRequired") })
    .check(
      z.trim(),
      z.minLength(1, message("forms.shippingNameRequired")),
      z.maxLength(60, message("forms.textTooLong")),
    ),
  price: price(true),
  freeFrom: price(false),
  pickup: z.pipe(
    z._default(z.string(), ""),
    z.transform((value) => value === "on" || value === "true"),
  ),
});

/** The Shipping form of the workspace's Store: the list of options, top to bottom. */
export const shippingSettingsSchema = z.object({
  methods: z._default(
    z
      .array(methodFields)
      .check(z.maxLength(SHIPPING_METHODS_MAX, message("forms.shippingTooMany"))),
    [],
  ),
});
export type ShippingSettingsInput = z.infer<typeof shippingSettingsSchema>;

/** The form's values as `store_settings.shipping`; a new option gets its id here. */
export function shippingFromForm(
  input: ShippingSettingsInput,
  newId: () => string,
): Required<StoreShipping> {
  return {
    methods: input.methods.map((method) => ({
      id: method.id || newId(),
      name: method.name,
      price: priceToMinor(method.price) ?? 0,
      freeFrom: method.freeFrom === "" ? null : priceToMinor(method.freeFrom),
      pickup: method.pickup,
    })),
  };
}

/** The saved options as the form shows them again. */
export function shippingToForm(shipping: StoreShipping) {
  return {
    methods: (shipping.methods ?? []).map((method) => ({
      id: method.id,
      name: method.name,
      price: minorToPrice(method.price),
      freeFrom: method.freeFrom === null ? "" : minorToPrice(method.freeFrom),
      pickup: method.pickup ? "on" : "",
    })),
  };
}
