import { parseWithZod } from "@conform-to/zod/v4";
import {
  addToCart,
  addToCartSchema,
  applyCouponSchema,
  CART_LINE_MAX,
  normalizeCouponCode,
  setCartQuantity,
} from "@monaztore/contracts";
import { type PricedCart, priceCart } from "@monaztore/core";
import { ImageIcon, MinusIcon, PlusIcon, TagIcon, Trash2Icon, XIcon } from "lucide-react";
import { data, Form, href, Link } from "react-router";
import { z } from "zod/mini";
import { Button, buttonVariants } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { cartCookieHeader, couponCookieHeader, readCart, readCoupon } from "~/lib/cart.server";
import { metaT, useLocale, useT } from "~/lib/i18n";
import { formatPrice } from "~/lib/money";
import { requestAddress, withinRateLimits } from "~/lib/rate-limit.server";
import { requireStore } from "~/middleware/store.server";
import type { Route } from "./+types/cart";

const setQuantitySchema = z.object({
  productId: z.uuid(),
  variantId: z.optional(z.uuid()),
  quantity: z.coerce.number().check(z.int(), z.minimum(0), z.maximum(CART_LINE_MAX)),
});

export function meta({ matches }: Route.MetaArgs) {
  const t = metaT(matches);
  return [{ title: t("storefront.cart") }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const store = requireStore(context);
  const [cart, couponCode] = await Promise.all([readCart(request), readCoupon(request)]);
  const priced = await priceCart(store, cart, { couponCode });
  // What can't be bought any more leaves the cookie too, so the header's count is true.
  const kept = priced.lines.map(({ productId, variantId, quantity }) => ({
    productId,
    variantId,
    quantity,
  }));
  const changed = priced.removed > 0 || priced.shortOfStock > 0;
  // A code that can't work any more (deleted, ended, used up) is said once and forgotten; one
  // that only waits for the cart (a minimum, other products) stays.
  const gone = couponCode !== null && couponIsGone(priced.couponProblem);
  const headers = new Headers();
  if (changed) headers.append("Set-Cookie", await cartCookieHeader(kept));
  if (gone) headers.append("Set-Cookie", await couponCookieHeader(null));
  return data(
    { cart: priced, couponCode: gone ? null : couponCode, couponGone: gone },
    { headers },
  );
}

/** What the cart says about a code: why it doesn't apply, or what went wrong typing it. */
type CouponMessage = NonNullable<PricedCart["couponProblem"]> | "invalid" | "gone" | "tooMany";

const couponIsGone = (problem: PricedCart["couponProblem"]) =>
  problem === "not_found" ||
  problem === "inactive" ||
  problem === "expired" ||
  problem === "used_up" ||
  problem === "not_started";

/** The code typed in the cart, checked with the cart as it is: only a code that can work stays. */
async function couponAction(
  request: Request,
  formData: FormData,
  store: ReturnType<typeof requireStore>,
) {
  if (formData.get("intent") === "removeCoupon") {
    return data(
      { result: undefined, added: false, couponError: null },
      { headers: { "Set-Cookie": await couponCookieHeader(null) } },
    );
  }
  const parsed = applyCouponSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return data(
      { result: undefined, added: false, couponError: "invalid" as const },
      { status: 400 },
    );
  }
  const code = normalizeCouponCode(parsed.data.code);
  const priced = await priceCart(store, await readCart(request), { couponCode: code });
  if (couponIsGone(priced.couponProblem)) {
    return data(
      { result: undefined, added: false, couponError: priced.couponProblem },
      { status: 400 },
    );
  }
  return data(
    { result: undefined, added: false, couponError: null },
    { headers: { "Set-Cookie": await couponCookieHeader(code) } },
  );
}

/** "Add to cart" from a product page, and the − / + / remove buttons here. */
export async function action({ request, context }: Route.ActionArgs) {
  const store = requireStore(context);
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent === "coupon" || intent === "removeCoupon") {
    if (intent === "coupon" && !(await withinRateLimits([["couponIp", requestAddress(request)]]))) {
      return data(
        { result: undefined, added: false, couponError: "tooMany" as const },
        { status: 429 },
      );
    }
    return couponAction(request, formData, store);
  }
  const cart = await readCart(request);
  if (formData.get("intent") === "add") {
    const submission = parseWithZod(formData, { schema: addToCartSchema });
    if (submission.status !== "success") {
      return data({ result: submission.reply(), added: false, couponError: null }, { status: 400 });
    }
    return data(
      { result: submission.reply({ resetForm: false }), added: true, couponError: null },
      { headers: { "Set-Cookie": await cartCookieHeader(addToCart(cart, submission.value)) } },
    );
  }
  const parsed = setQuantitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw data("Bad cart change", { status: 400 });
  const { productId, variantId, quantity } = parsed.data;
  const next = setCartQuantity(cart, { productId, variantId: variantId ?? null }, quantity);
  return data(
    { result: undefined, added: false, couponError: null },
    { headers: { "Set-Cookie": await cartCookieHeader(next) } },
  );
}

export default function Cart({ loaderData, actionData }: Route.ComponentProps) {
  const t = useT();
  const locale = useLocale();
  const { cart, couponCode, couponGone } = loaderData;
  const money = (minor: number) => formatPrice(minor, cart.currency, locale);

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t("storefront.cart")}</h1>
      {cart.removed > 0 || cart.shortOfStock > 0 ? (
        <div
          role="alert"
          className="mb-4 grid gap-1 rounded-md border border-destructive p-3 text-sm"
        >
          {cart.removed > 0 ? <p>{t("storefront.cartRemoved", { count: cart.removed })}</p> : null}
          {cart.shortOfStock > 0 ? <p>{t("storefront.cartShort")}</p> : null}
        </div>
      ) : null}
      {cart.lines.length === 0 ? (
        <div className="grid justify-items-center gap-4 py-10 text-center">
          <p className="text-muted-foreground">{t("storefront.cartEmpty")}</p>
          <Link to={href("/products")} className={buttonVariants({ variant: "outline" })}>
            {t("storefront.keepShopping")}
          </Link>
        </div>
      ) : (
        <div className="grid gap-8 md:grid-cols-[1fr_20rem] md:items-start">
          <ul className="divide-y">
            {cart.lines.map((line) => {
              const label = line.variantTitle ? `${line.name} (${line.variantTitle})` : line.name;
              const hidden = (
                <>
                  <input type="hidden" name="productId" value={line.productId} />
                  {line.variantId ? (
                    <input type="hidden" name="variantId" value={line.variantId} />
                  ) : null}
                </>
              );
              const atMax =
                line.quantity >= CART_LINE_MAX ||
                (line.stockQuantity !== null && line.quantity >= line.stockQuantity);
              return (
                <li key={`${line.productId}:${line.variantId}`} className="flex gap-3 py-4">
                  <div className="relative size-20 shrink-0 overflow-hidden rounded-md bg-muted">
                    {line.imageUrl ? (
                      <img
                        src={line.imageUrl}
                        alt=""
                        width={80}
                        height={80}
                        className="size-full object-cover"
                      />
                    ) : (
                      <ImageIcon
                        aria-hidden
                        className="absolute inset-0 m-auto size-6 text-muted-foreground"
                      />
                    )}
                  </div>
                  <div className="grid flex-1 content-start gap-1">
                    <Link
                      to={href("/products/:slug", { slug: line.slug })}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {line.name}
                    </Link>
                    {line.variantTitle ? (
                      <p className="text-sm text-muted-foreground">{line.variantTitle}</p>
                    ) : null}
                    <p className="text-sm">{money(line.unitPrice)}</p>
                    <div className="mt-1 flex items-center gap-1">
                      <Form method="post">
                        {hidden}
                        <input type="hidden" name="quantity" value={line.quantity - 1} />
                        <Button
                          type="submit"
                          variant="outline"
                          size="icon"
                          aria-label={t("storefront.decrease", { name: label })}
                        >
                          <MinusIcon aria-hidden className="size-4" />
                        </Button>
                      </Form>
                      <output className="w-10 text-center" aria-label={t("storefront.quantity")}>
                        {line.quantity}
                      </output>
                      <Form method="post">
                        {hidden}
                        <input type="hidden" name="quantity" value={line.quantity + 1} />
                        <Button
                          type="submit"
                          variant="outline"
                          size="icon"
                          disabled={atMax}
                          aria-label={t("storefront.increase", { name: label })}
                        >
                          <PlusIcon aria-hidden className="size-4" />
                        </Button>
                      </Form>
                      <Form method="post" className="ml-auto">
                        {hidden}
                        <input type="hidden" name="quantity" value={0} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon"
                          aria-label={t("storefront.remove", { name: label })}
                        >
                          <Trash2Icon aria-hidden className="size-4" />
                        </Button>
                      </Form>
                    </div>
                  </div>
                  <p className="font-medium">{money(line.lineTotal)}</p>
                </li>
              );
            })}
          </ul>
          <div className="sticky bottom-0 z-20 -mx-4 grid gap-3 border-t bg-background px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:mx-0 md:rounded-md md:border md:p-4">
            <CouponBox
              code={couponCode}
              applied={cart.coupon !== null}
              problem={cart.couponProblem}
              error={actionData?.couponError ?? (couponGone ? "gone" : null)}
            />
            {cart.discount > 0 ? (
              <dl className="grid gap-1 text-sm">
                <div className="flex justify-between">
                  <dt>{t("storefront.subtotal")}</dt>
                  <dd>{money(cart.subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>{t("storefront.discount", { code: cart.coupon?.code ?? "" })}</dt>
                  <dd>−{money(cart.discount)}</dd>
                </div>
              </dl>
            ) : null}
            <p className="flex justify-between text-lg font-semibold">
              <span>{cart.discount > 0 ? t("storefront.total") : t("storefront.subtotal")}</span>
              <span>{money(cart.total)}</span>
            </p>
            <Link to={href("/checkout")} className={buttonVariants({ size: "lg" })}>
              {t("storefront.checkout")}
            </Link>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * The discount code: a field and "Apply", or the code that's on with its "remove". It's checked
 * in the `action` only, so the cart doesn't load a schema in the browser.
 */
function CouponBox({
  code,
  applied,
  problem,
  error,
}: {
  code: string | null;
  applied: boolean;
  problem: PricedCart["couponProblem"];
  error: CouponMessage | null;
}) {
  const t = useT();
  if (code) {
    return (
      <div className="grid gap-1">
        <div className="flex items-center justify-between gap-2 rounded-md border border-dashed p-2 pl-3 text-sm">
          <span className="flex items-center gap-2">
            <TagIcon aria-hidden className="size-4" />
            <span className="font-mono font-medium">{code}</span>
          </span>
          <Form method="post">
            <input type="hidden" name="intent" value="removeCoupon" />
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              aria-label={t("storefront.couponRemove", { code })}
            >
              <XIcon aria-hidden className="size-4" />
            </Button>
          </Form>
        </div>
        {!applied && problem ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t(`storefront.coupon_${problem}`)}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <details className="group" open={error !== null}>
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
        <TagIcon aria-hidden className="size-4" />
        {t("storefront.couponAsk")}
      </summary>
      <Form method="post" className="grid gap-2 pt-1">
        <input type="hidden" name="intent" value="coupon" />
        <label htmlFor="coupon-code" className="sr-only">
          {t("storefront.couponLabel")}
        </label>
        <div className="flex gap-2">
          <Input
            id="coupon-code"
            name="code"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={32}
            required
            placeholder={t("storefront.couponLabel")}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "coupon-error" : undefined}
            className="uppercase"
          />
          <Button type="submit" variant="outline">
            {t("storefront.couponApply")}
          </Button>
        </div>
        {error ? (
          <p id="coupon-error" role="alert" className="text-sm text-destructive">
            {t(`storefront.coupon_${error}`)}
          </p>
        ) : null}
      </Form>
    </details>
  );
}
