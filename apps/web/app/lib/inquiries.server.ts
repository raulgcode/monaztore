import { inquirySchema, type PageBlock, whatsappChatUrl } from "@monaztore/contracts";
import {
  NotFoundError,
  type StorefrontContext,
  storeOwnerContacts,
  submitInquiry,
} from "@monaztore/core";
import { storeInquiryMessage } from "@monaztore/email";
import { defaultLocale, parseLocale } from "@monaztore/i18n";
import { data, href } from "react-router";
import type { InquiryFormContext, InquiryResult } from "~/components/pages/inquiry-form";
import { botSignal, formStamp, verifyTurnstile } from "./bot-guard.server";
import { requestAddress, withinRateLimits } from "./rate-limit.server";
import { env, mailer, secrets } from "./services.server";

/** What a page's request forms need from its loader; null when the page has none. */
export function inquiryFormContext(blocks: PageBlock[]): InquiryFormContext | null {
  if (!blocks.some((block) => block.type === "form")) return null;
  return { stamp: formStamp(secrets.forms), turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? null };
}

type Errors = NonNullable<InquiryResult["inquiry"]["errors"]>;

/**
 * A request from one of the store's pages (`/<slug>` or the front page). In order: the quiet bot
 * checks (a bot is told it went through, and nothing is kept), the rate limits, the schema,
 * Turnstile when the instance has it, then the request is kept and the owners emailed (not
 * awaited: a slow email never holds the shopper).
 */
export async function inquiryAction(
  request: Request,
  store: StorefrontContext,
  pageSlug: string,
  formData: FormData,
) {
  const blockId = String(formData.get("blockId") ?? "").slice(0, 40);
  const reply = (inquiry: Omit<InquiryResult["inquiry"], "blockId">, status = 200) =>
    data<InquiryResult>({ inquiry: { blockId, ...inquiry } }, { status });

  if (botSignal(formData, { secret: secrets.forms, minFillMs: env.FORM_MIN_FILL_MS })) {
    return reply({ sent: true });
  }
  const ip = requestAddress(request);
  if (!(await withinRateLimits([["inquiryIp", ip]]))) {
    return reply({ formError: "storefront.formTooMany" }, 429);
  }
  const parsed = inquirySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const errors: Errors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (field === "name" || field === "email" || field === "phone" || field === "message") {
        errors[field] = [...(errors[field] ?? []), issue.message];
      }
    }
    return reply({ errors }, 400);
  }
  if (env.TURNSTILE_SECRET_KEY) {
    const token = String(formData.get("cf-turnstile-response") ?? "");
    if (!(await verifyTurnstile(env.TURNSTILE_SECRET_KEY, token, ip))) {
      return reply({ formError: "storefront.formCaptcha" }, 400);
    }
  }
  if (!(await withinRateLimits([["inquiryEmail", parsed.data.email]]))) {
    return reply({ formError: "storefront.formTooMany" }, 429);
  }
  let saved: { pageTitle: string };
  try {
    saved = await submitInquiry(store, pageSlug, parsed.data);
  } catch (error) {
    if (error instanceof NotFoundError) throw data("Not found", { status: 404 });
    throw error;
  }
  void tellOwners(store, { ...parsed.data, pageTitle: saved.pageTitle });
  return reply({ sent: true });
}

async function tellOwners(
  store: StorefrontContext,
  inquiry: { pageTitle: string; name: string; email: string; phone: string; message: string },
) {
  try {
    const owners = await storeOwnerContacts(store);
    const url = `${env.APP_URL}${href("/app/:workspace/inquiries", { workspace: store.store.slug })}`;
    await Promise.all(
      owners.map(async (owner) => {
        const locale =
          parseLocale(owner.locale) ?? parseLocale(store.store.locale) ?? defaultLocale;
        try {
          await mailer.send({
            to: owner.email,
            replyTo: inquiry.email,
            ...storeInquiryMessage({
              locale,
              storeName: store.store.name,
              ...inquiry,
              url,
              whatsappUrl: inquiry.phone ? whatsappChatUrl(inquiry.phone, "") : null,
            }),
          });
        } catch (error) {
          console.error("The store's notice of a request didn't go out", error);
        }
      }),
    );
  } catch (error) {
    console.error("The store's owners couldn't be told of a request", error);
  }
}
