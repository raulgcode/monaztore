import { imageWidths } from "@monaztore/storage/images";
import { describe, expect, it } from "vitest";
import { photoSrc, photoSrcSet, photoWidths } from "./media";

describe("photoSrcSet", () => {
  it("offers our photos at narrower widths and the full one", () => {
    expect(photoSrcSet("/media/organizations/a/images/b.webp", [320, 640])).toBe(
      "/media/organizations/a/images/b.webp?w=320 320w, /media/organizations/a/images/b.webp?w=640 640w, /media/organizations/a/images/b.webp 1200w",
    );
    expect(photoSrc("/media/organizations/a/images/b.webp", 160)).toBe(
      "/media/organizations/a/images/b.webp?w=160",
    );
  });
  it("leaves a photo of another site as it is", () => {
    expect(photoSrcSet("https://shop.example/a.jpg", [320])).toBeUndefined();
    expect(photoSrc("https://shop.example/a.jpg", 160)).toBe("https://shop.example/a.jpg");
  });
  it("asks only for the widths the server makes", () => {
    expect([...photoWidths]).toEqual([...imageWidths]);
  });
});
