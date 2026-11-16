import type { formBlock } from "@monaztore/contracts";
import { CheckCircle2Icon, ShieldCheckIcon } from "lucide-react";
import { useEffect, useId } from "react";
import { useActionData, useFetcher } from "react-router";
import type { z } from "zod/mini";
import { heroButton } from "~/components/storefront/hero-panel";
import { FieldErrors } from "~/components/text-field";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { HONEYPOT_FIELD, STAMP_FIELD } from "~/lib/bot-guard-fields";
import { useLocale, useT } from "~/lib/i18n";
import { cn } from "~/lib/utils";

type FormBlock = z.infer<typeof formBlock>;

/** What the page's action answers a request form with. */
export interface InquiryResult {
  inquiry: {
    blockId: string;
    sent?: boolean;
    errors?: Partial<Record<"name" | "email" | "phone" | "message", string[]>>;
    formError?: string;
  };
}

/** What the page gives its forms: the signed moment it was shown, and Turnstile's key if on. */
export interface InquiryFormContext {
  stamp: string;
  turnstileSiteKey: string | null;
}

declare global {
  interface Window {
    turnstile?: { reset: (widget?: string | HTMLElement) => void };
  }
}

/**
 * A page's request form: name, email, WhatsApp and the idea. Light on purpose (a store page):
 * the browser checks what's required and the page's action checks the schema
 * (`inquirySchema`), the hidden field, the time it took, the rate limits and, when the instance
 * has it, Turnstile. The shopper stays on the page and sees their request was sent.
 */
export function InquiryForm({
  block,
  context,
  preview = false,
}: {
  block: FormBlock;
  context?: InquiryFormContext;
  /** In the workspace's editor: drawn as it will look, never sent. */
  preview?: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const fetcher = useFetcher<InquiryResult>({ key: `inquiry-${block.id}` });
  const actionData = useActionData() as InquiryResult | undefined;
  const result = [fetcher.data, actionData].find(
    (data) => data?.inquiry?.blockId === block.id,
  )?.inquiry;
  const id = useId();
  const busy = fetcher.state !== "idle";
  const siteKey = context?.turnstileSiteKey ?? null;

  // A Turnstile token works once: a request that came back with errors needs a new one.
  useEffect(() => {
    if (result && !result.sent && siteKey) window.turnstile?.reset();
  }, [result, siteKey]);

  if (result?.sent) {
    return (
      <div
        role="status"
        className="grid justify-items-center gap-3 rounded-2xl bg-accent p-8 text-center text-accent-foreground"
      >
        <CheckCircle2Icon aria-hidden className="size-10" />
        <p className="text-xl font-semibold">{t("storefront.formSentTitle")}</p>
        <p>{t("storefront.formSentBody")}</p>
      </div>
    );
  }

  const field = (name: "name" | "email" | "phone" | "message") => {
    const errors = result?.errors?.[name];
    const errorId = `${id}-${name}-error`;
    return {
      id: `${id}-${name}`,
      name,
      "aria-invalid": errors?.length ? true : undefined,
      "aria-describedby": errors?.length ? errorId : undefined,
      errorId,
      errors,
    };
  };
  const name = field("name");
  const email = field("email");
  const phone = field("phone");
  const message = field("message");

  return (
    <fetcher.Form method="post" className="grid gap-4" noValidate={false}>
      <fieldset disabled={preview || busy} className="grid gap-4">
        <input type="hidden" name="intent" value="inquiry" />
        <input type="hidden" name="blockId" value={block.id} />
        <input type="hidden" name={STAMP_FIELD} value={context?.stamp ?? ""} />
        {/* People never see it; scripts fill every field they find. */}
        <div aria-hidden className="absolute -left-[9999px] size-px overflow-hidden">
          <label htmlFor={`${id}-${HONEYPOT_FIELD}`}>{t("storefront.formHoneypot")}</label>
          <input
            id={`${id}-${HONEYPOT_FIELD}`}
            name={HONEYPOT_FIELD}
            type="text"
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor={name.id}>{t("storefront.formName")}</Label>
            <Input {...inputProps(name)} autoComplete="name" required maxLength={80} />
            <FieldErrors id={name.errorId} errors={name.errors} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={email.id}>{t("storefront.formEmail")}</Label>
            <Input
              {...inputProps(email)}
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              maxLength={254}
            />
            <FieldErrors id={email.errorId} errors={email.errors} />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={phone.id}>{t("storefront.formPhone")}</Label>
          <Input
            {...inputProps(phone)}
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            maxLength={20}
            aria-describedby={cn(`${phone.id}-hint`, phone["aria-describedby"]) || undefined}
          />
          <p id={`${phone.id}-hint`} className="text-sm text-muted-foreground">
            {t("storefront.formPhoneHint")}
          </p>
          <FieldErrors id={phone.errorId} errors={phone.errors} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={message.id}>
            {block.messageLabel || t("storefront.formMessageDefault")}
          </Label>
          <textarea
            {...inputProps(message)}
            required
            rows={5}
            maxLength={2000}
            className="min-h-32 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
          />
          <FieldErrors id={message.errorId} errors={message.errors} />
        </div>
        {siteKey && !preview ? (
          <>
            <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
            <div className="cf-turnstile" data-sitekey={siteKey} data-language={locale} />
          </>
        ) : null}
        {result?.formError ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {t(result.formError as "storefront.formTooMany")}
          </p>
        ) : null}
        <button
          type="submit"
          className={cn(heroButton.primary, "w-full sm:w-auto sm:justify-self-start")}
        >
          {busy
            ? t("storefront.formSending")
            : block.buttonLabel || t("storefront.formSubmitDefault")}
        </button>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheckIcon aria-hidden className="size-4 shrink-0" />
          {t("storefront.formPrivacy")}
        </p>
      </fieldset>
    </fetcher.Form>
  );
}

function inputProps({
  errorId: _errorId,
  errors: _errors,
  ...props
}: {
  id: string;
  name: string;
  errorId: string;
  errors?: string[];
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  return props;
}
