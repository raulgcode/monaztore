import { parseWithZod } from "@conform-to/zod/v4";
import { addToCart, addToCartSchema, CART_LINE_MAX, setCartQuantity } from "@monaztore/contracts";
import { priceCart } from "@monaztore/core";
import { ImageIcon, MinusIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { data, Form, href, Link } from "react-router";
import { z } from "zod/mini";
import { Button, buttonVariants } from "~/components/ui/button";
import { cartCookieHeader, readCart } from "~/lib/cart.server";
import { metaT, useLocale, useT } from "~/lib/i18n";
import { formatPrice } from "~/lib/money";
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
  const cart = await readCart(request);
  const priced = await priceCart(store, cart);
  // What can't be bought any more leaves the cookie too, so the header's count is true.
  const kept = priced.lines.map(({ productId, variantId, quantity }) => ({
    productId,
    variantId,
    quantity,
  }));
  const changed = priced.removed > 0 || priced.shortOfStock > 0;
  return data(
    { cart: priced },
    changed ? { headers: { "Set-Cookie": await cartCookieHeader(kept) } } : undefined,
  );
}

/** "Add to cart" from a product page, and the − / + / remove buttons here. */
export async function action({ request, context }: Route.ActionArgs) {
  requireStore(context);
  const formData = await request.formData();
  const cart = await readCart(request);
  if (formData.get("intent") === "add") {
    const submission = parseWithZod(formData, { schema: addToCartSchema });
    if (submission.status !== "success") {
      return data({ result: submission.reply(), added: false }, { status: 400 });
    }
    return data(
      { result: submission.reply({ resetForm: false }), added: true },
      { headers: { "Set-Cookie": await cartCookieHeader(addToCart(cart, submission.value)) } },
    );
  }
  const parsed = setQuantitySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw data("Bad cart change", { status: 400 });
  const { productId, variantId, quantity } = parsed.data;
  const next = setCartQuantity(cart, { productId, variantId: variantId ?? null }, quantity);
  return data(
    { result: undefined, added: false },
    { headers: { "Set-Cookie": await cartCookieHeader(next) } },
  );
}

export default function Cart({ loaderData }: Route.ComponentProps) {
  const t = useT();
  const locale = useLocale();
  const { cart } = loaderData;
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
            <p className="flex justify-between text-lg font-semibold">
              <span>{t("storefront.subtotal")}</span>
              <span>{money(cart.subtotal)}</span>
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
