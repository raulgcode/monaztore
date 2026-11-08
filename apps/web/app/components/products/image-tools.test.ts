import { describe, expect, it } from "vitest";
import { cropAreaOf } from "./image-tools";

describe("cropAreaOf", () => {
  const image = { width: 2000, height: 1000 };

  it("takes the biggest square of a wide photo, in its middle", () => {
    expect(cropAreaOf(image, 1, 1, { x: 0.5, y: 0.5 })).toEqual({
      x: 500,
      y: 0,
      width: 1000,
      height: 1000,
    });
  });

  it("keeps the whole photo for its own shape", () => {
    expect(cropAreaOf(image, 2, 1, { x: 0.5, y: 0.5 })).toEqual({
      x: 0,
      y: 0,
      width: 2000,
      height: 1000,
    });
  });

  it("zooms in around the center it's given", () => {
    expect(cropAreaOf(image, 1, 2, { x: 0.25, y: 0.5 })).toEqual({
      x: 250,
      y: 250,
      width: 500,
      height: 500,
    });
  });

  it("never leaves the photo, even with the center at its edge", () => {
    expect(cropAreaOf(image, 1, 1, { x: 0, y: 1 })).toEqual({
      x: 0,
      y: 0,
      width: 1000,
      height: 1000,
    });
    expect(cropAreaOf(image, 4 / 5, 2, { x: 1, y: 1 })).toEqual({
      x: 1600,
      y: 500,
      width: 400,
      height: 500,
    });
  });
});
