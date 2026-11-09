import {
  type CouponKindName,
  couponFormSchema,
  couponInputOf,
  couponKinds,
  dayOf,
  minorToPrice,
} from "@monaztore/contracts";
import {
  type CouponRow,
  catalogSettings,
  deleteCoupon,
  getCoupon,
  listCoupons,
  saveCoupon,
  setCouponActive,
} from "@monaztore/core";
import { z } from "zod";
import {
  change,
  destructive,
  json,
  priceArg,
  readOnly,
  storeArg,
  ToolError,
  type ToolModule,
} from "../kit";

const couponId = z.uuid().describe("The coupon's id, from list_coupons");
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("YYYY-MM-DD, in the store's time zone");

const couponFields = {
  code: z
    .string()
    .min(3)
    .max(32)
    .optional()
    .describe("What shoppers type: letters, digits, - and _"),
  note: z.string().max(200).optional().describe("A note for the team; shoppers don't see it"),
  kind: z.enum(couponKinds).optional().describe("percent off, or a fixed amount off"),
  amount: z
    .string()
    .optional()
    .describe("percent: a whole number 1-100; fixed: the amount in the store's currency"),
  startsOn: z.union([day, z.literal("")]).optional(),
  endsOn: z.union([day, z.literal("")]).optional(),
  usageLimit: z.number().int().min(1).nullable().optional().describe("Total uses; null for none"),
  usageLimitPerCustomer: z
    .number()
    .int()
    .min(1)
    .nullable()
    .optional()
    .describe("Uses per email; null for no limit"),
  minSubtotal: z
    .union([priceArg, z.literal("")])
    .optional()
    .describe("Minimum purchase"),
  productIds: z.array(z.uuid()).max(100).optional().describe("Only these products"),
  categoryIds: z.array(z.uuid()).max(100).optional().describe("Only these categories"),
  excludeSaleItems: z.boolean().optional().describe("Leave out products on offer"),
  active: z.boolean().optional(),
};
type CouponFields = { [K in keyof typeof couponFields]?: z.infer<(typeof couponFields)[K]> };

const amountText = (kind: CouponKindName, amount: number) =>
  kind === "percent" ? String(amount) : minorToPrice(amount);

function couponView(coupon: CouponRow, timeZone: string) {
  return {
    ...coupon,
    amount: amountText(coupon.kind, coupon.amount),
    minSubtotal: coupon.minSubtotal === null ? null : minorToPrice(coupon.minSubtotal),
    startsOn: coupon.startsAt ? dayOf(coupon.startsAt, timeZone) : null,
    endsOn: coupon.endsAt ? dayOf(coupon.endsAt, timeZone, { endOfDay: true }) : null,
  };
}

/** Discount codes (Coupons in the workspace): owners only, like the workspace. */
export const registerCouponTools: ToolModule = (server, kit) => {
  const owners = (store: string) => kit.tenantFor(store, { owner: true });

  server.registerTool(
    "list_coupons",
    {
      title: "List coupons",
      description:
        "The store's discount codes with their rules and how many times each was used. Owners only.",
      inputSchema: { store: storeArg },
      annotations: readOnly,
    },
    kit.tool(async ({ store }: { store: string }) => {
      const tenant = await owners(store);
      const [coupons, settings] = await Promise.all([listCoupons(tenant), catalogSettings(tenant)]);
      return json({
        currency: settings.currency,
        coupons: coupons.map((coupon) => couponView(coupon, settings.timeZone)),
      });
    }),
  );

  server.registerTool(
    "save_coupon",
    {
      title: "Create or change a coupon",
      description:
        "Without couponId it creates a code (active unless active is false); with it, changes only the fields given. With productIds or categoryIds it only applies to those. Owners only. Show the rules and ask before saving.",
      inputSchema: { store: storeArg, couponId: couponId.optional(), ...couponFields },
      annotations: change,
    },
    kit.tool(
      async ({
        store,
        couponId: id,
        ...changes
      }: { store: string; couponId?: string } & CouponFields) => {
        const tenant = await owners(store);
        const { timeZone } = await catalogSettings(tenant);
        const current = id ? await getCoupon(tenant, id) : undefined;
        if (id && !current) throw new ToolError(`No coupon ${id} in this store.`);
        if (!current && (!changes.code || !changes.amount)) {
          throw new ToolError("A new coupon needs a code and an amount.");
        }
        const kind = changes.kind ?? current?.kind ?? "percent";
        const productIds = changes.productIds ?? current?.productIds ?? [];
        const categoryIds = changes.categoryIds ?? current?.categoryIds ?? [];
        const pick = <T>(value: T | undefined, saved: T) => (value === undefined ? saved : value);
        const count = (value: number | null) => (value === null ? "" : String(value));
        const form = couponFormSchema.parse({
          code: pick(changes.code, current?.code ?? ""),
          note: pick(changes.note, current?.note ?? ""),
          kind,
          amount: pick(changes.amount, current ? amountText(current.kind, current.amount) : ""),
          startsOn: pick(
            changes.startsOn,
            current?.startsAt ? dayOf(current.startsAt, timeZone) : "",
          ),
          endsOn: pick(
            changes.endsOn,
            current?.endsAt ? dayOf(current.endsAt, timeZone, { endOfDay: true }) : "",
          ),
          timeZone,
          usageLimit: count(pick(changes.usageLimit, current?.usageLimit ?? null)),
          usageLimitPerCustomer: count(
            pick(changes.usageLimitPerCustomer, current?.usageLimitPerCustomer ?? null),
          ),
          minSubtotal: pick(
            changes.minSubtotal,
            current?.minSubtotal == null ? "" : minorToPrice(current.minSubtotal),
          ),
          appliesTo: productIds.length + categoryIds.length > 0 ? "some" : "all",
          productIds,
          categoryIds,
          excludeSaleItems: pick(changes.excludeSaleItems, current?.excludeSaleItems ?? false)
            ? "on"
            : "",
          active: pick(changes.active, current?.active ?? true) ? "on" : "",
        });
        const saved = await saveCoupon(tenant, id ?? null, couponInputOf(form));
        const coupon = await getCoupon(tenant, saved);
        return json({ saved: true, coupon: coupon ? couponView(coupon, timeZone) : null });
      },
    ),
  );

  server.registerTool(
    "set_coupon_active",
    {
      title: "Turn a coupon on or off",
      description: "An inactive code stops working in the cart; it can be turned on again.",
      inputSchema: { store: storeArg, couponId, active: z.boolean() },
      annotations: change,
    },
    kit.tool(
      async ({
        store,
        couponId: id,
        active,
      }: {
        store: string;
        couponId: string;
        active: boolean;
      }) => {
        const tenant = await owners(store);
        await setCouponActive(tenant, id, active);
        return json({ active });
      },
    ),
  );

  server.registerTool(
    "delete_coupon",
    {
      title: "Delete a coupon",
      description:
        "Removes the code; orders that used it keep their discount. Ask before deleting: it can't be undone (set_coupon_active turns it off instead).",
      inputSchema: { store: storeArg, couponId },
      annotations: destructive,
    },
    kit.tool(async ({ store, couponId: id }: { store: string; couponId: string }) => {
      const tenant = await owners(store);
      await deleteCoupon(tenant, id);
      return json({ deleted: true });
    }),
  );
};
