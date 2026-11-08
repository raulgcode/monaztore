import { expect, it } from "vitest";
import { slugify, uniqueSlug } from "./slug";

it.each([
  ["Café La Esquina", "cafe-la-esquina"],
  ["  Pan & Más!! ", "pan-mas"],
  ["Ñandú 24/7", "nandu-24-7"],
])("slugify(%s) is %s", (input, expected) => {
  expect(slugify(input)).toBe(expected);
});

it("uniqueSlug keeps the readable part and adds a suffix", () => {
  expect(uniqueSlug("Café Luna")).toMatch(/^cafe-luna-[0-9a-f]{6}$/);
  expect(uniqueSlug("!!!")).toMatch(/^workspace-[0-9a-f]{6}$/);
});
