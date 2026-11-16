import type { PageBlock } from "@monaztore/contracts";
import type { StoreThemeSettings } from "@monaztore/db/schema";
import type { serverT } from "./locale.server";

/** The templates "New page" offers: a blank page, a front page and a personalized product's. */
export const pageTemplates = ["blank", "front", "custom"] as const;
export type PageTemplate = (typeof pageTemplates)[number];

export function readPageTemplate(value: unknown): PageTemplate {
  return pageTemplates.includes(value as PageTemplate) ? (value as PageTemplate) : "blank";
}

type T = ReturnType<typeof serverT>;

/**
 * A template's title, address and blocks, in the owner's language. The front page starts with
 * what Design already has (cover, photo, promises), so switching to it changes nothing at first.
 */
export function pageTemplate(
  template: PageTemplate,
  t: T,
  theme: StoreThemeSettings,
  storeName: string,
): { title: string; slug: string; blocks: PageBlock[] } {
  if (template === "front") {
    const highlights = theme.highlights?.length
      ? theme.highlights
      : [
          t("pages.tplFrontHighlight1"),
          t("pages.tplFrontHighlight2"),
          t("pages.tplFrontHighlight3"),
        ];
    return {
      title: t("pages.tplFrontTitle"),
      slug: "",
      blocks: [
        {
          type: "hero",
          id: "cover",
          eyebrow: "",
          title: theme.heroTitle || storeName,
          text: theme.heroSubtitle || t("pages.tplFrontText"),
          image: theme.heroImageUrl ?? "",
          illustration: theme.heroImageUrl ? "" : "gift",
          buttonLabel: t("pages.tplFrontButton"),
          buttonHref: "/products",
        },
        { type: "highlights", id: "promises", items: highlights.slice(0, 4) },
        { type: "collections", id: "categories", title: t("pages.tplFrontCollections"), limit: 8 },
        {
          type: "products",
          id: "new",
          title: t("pages.tplFrontNew"),
          collection: "",
          onSale: false,
          layout: "carousel",
          limit: 8,
        },
        {
          type: "products",
          id: "sale",
          title: t("pages.tplFrontSale"),
          collection: "",
          onSale: true,
          layout: "grid",
          limit: 4,
        },
      ],
    };
  }
  if (template === "custom") {
    return {
      title: t("pages.tplCustomTitle"),
      slug: t("pages.tplCustomSlug"),
      blocks: [
        {
          type: "hero",
          id: "cover",
          eyebrow: t("pages.tplCustomEyebrow"),
          title: t("pages.tplCustomHeading"),
          text: t("pages.tplCustomText"),
          image: "",
          illustration: "gift",
          buttonLabel: t("pages.tplCustomButton"),
          buttonHref: "#request",
        },
        {
          type: "steps",
          id: "how",
          title: t("pages.tplStepsTitle"),
          intro: t("pages.tplStepsIntro"),
          items: (
            [
              ["photo", "tplStep1", "tplStep1Text"],
              ["design", "tplStep2", "tplStep2Text"],
              ["approve", "tplStep3", "tplStep3Text"],
              ["make", "tplStep4", "tplStep4Text"],
              ["deliver", "tplStep5", "tplStep5Text"],
            ] as const
          ).map(([illustration, title, text]) => ({
            illustration,
            title: t(`pages.${title}`),
            text: t(`pages.${text}`),
          })),
        },
        {
          type: "whatsapp",
          id: "whatsapp",
          title: t("pages.tplWhatsappTitle"),
          text: t("pages.tplWhatsappText"),
          label: t("pages.tplWhatsappLabel"),
          phone: "",
          message: t("pages.tplWhatsappMessage"),
        },
        {
          type: "form",
          id: "request",
          title: t("pages.tplFormTitle"),
          text: t("pages.tplFormText"),
          messageLabel: t("pages.tplFormMessage"),
          buttonLabel: t("pages.tplFormButton"),
        },
        {
          type: "faq",
          id: "questions",
          items: (["1", "2", "3"] as const).map((n) => ({
            question: t(`pages.tplFaqQ${n}`),
            answer: t(`pages.tplFaqA${n}`),
          })),
        },
        {
          type: "products",
          id: "ideas",
          title: t("pages.tplCustomProducts"),
          collection: "",
          onSale: false,
          layout: "carousel",
          limit: 4,
        },
      ],
    };
  }
  return {
    title: t("pages.newPageTitle"),
    slug: "",
    blocks: [
      { type: "heading", id: "b1", text: "", level: 2 },
      { type: "text", id: "b2", html: "" },
    ],
  };
}
