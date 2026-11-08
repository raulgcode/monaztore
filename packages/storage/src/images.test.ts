import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { downloadImage, imageWidths, narrowerImage, webImage } from "./images";

const png = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: "#ff3366" } })
    .png()
    .toBuffer();

describe("webImage", () => {
  it("re-encodes a photo as WebP no bigger than its longest side", async () => {
    const image = await webImage(await png(3000, 1500), { maxSize: 1600 });
    expect(image.contentType).toBe("image/webp");
    expect([image.width, image.height]).toEqual([1600, 800]);
    expect((await sharp(image.body).metadata()).format).toBe("webp");
  });

  it("never enlarges a small photo", async () => {
    const image = await webImage(await png(400, 300));
    expect([image.width, image.height]).toEqual([400, 300]);
  });

  it("refuses what isn't a photo, an SVG included", async () => {
    await expect(webImage(new TextEncoder().encode("<html></html>"))).rejects.toThrow();
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>x</script></svg>';
    await expect(webImage(new TextEncoder().encode(svg))).rejects.toThrow(/Unsupported/);
  });
});

describe("narrowerImage", () => {
  it("makes a photo as wide as asked, keeping its shape", async () => {
    const image = await narrowerImage(await png(1200, 1500), 320);
    expect([image.width, image.height]).toEqual([320, 400]);
    expect((await sharp(image.body).metadata()).format).toBe("webp");
  });

  it("never enlarges, and only takes the widths pages ask for", async () => {
    const image = await narrowerImage(await png(200, 200), 480);
    expect(image.width).toBe(200);
    await expect(narrowerImage(await png(200, 200), 333)).rejects.toThrow(/width/);
    expect(imageWidths).toContain(160);
  });
});

describe("downloadImage", () => {
  it("brings the bytes", async () => {
    const fetch = (async () => new Response(new Uint8Array([1, 2, 3]))) as typeof globalThis.fetch;
    expect([...(await downloadImage("https://shop.example/a.jpg", { fetch }))]).toEqual([1, 2, 3]);
  });

  it("stops at the size limit, even without a Content-Length", async () => {
    const fetch = (async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(6));
            controller.enqueue(new Uint8Array(6));
            controller.close();
          },
        }),
      )) as typeof globalThis.fetch;
    await expect(
      downloadImage("https://shop.example/a.jpg", { fetch, maxBytes: 10 }),
    ).rejects.toThrow(/Bigger than 10/);
  });

  it("says which address failed and only reads web addresses", async () => {
    const fetch = (async () => new Response("", { status: 404 })) as typeof globalThis.fetch;
    await expect(downloadImage("https://shop.example/gone.jpg", { fetch })).rejects.toThrow(
      "404 for https://shop.example/gone.jpg",
    );
    await expect(downloadImage("file:///etc/passwd")).rejects.toThrow(/Not a web address/);
  });
});
