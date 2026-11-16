/**
 * The drawings a store can put on its cover and its pages (`components/pages/illustrations.tsx`
 * in the web). Built in, painted with the store's colors, light and dark: no file to upload and
 * nothing to download from elsewhere.
 */
export const storeIllustrationIds = [
  "photo",
  "chat",
  "design",
  "approve",
  "make",
  "deliver",
  "gift",
  "socks",
  "mug",
  "heart",
] as const;

export type StoreIllustrationId = (typeof storeIllustrationIds)[number];
