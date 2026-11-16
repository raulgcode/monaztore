import type { StoreIllustrationId } from "@monaztore/contracts/illustrations";

/** Each built-in drawing's name, in the `pages` section. */
export const illustrationKeys = {
  photo: "pages.illustrationPhoto",
  chat: "pages.illustrationChat",
  design: "pages.illustrationDesign",
  approve: "pages.illustrationApprove",
  make: "pages.illustrationMake",
  deliver: "pages.illustrationDeliver",
  gift: "pages.illustrationGift",
  socks: "pages.illustrationSocks",
  mug: "pages.illustrationMug",
  heart: "pages.illustrationHeart",
} as const satisfies Record<StoreIllustrationId, string>;
