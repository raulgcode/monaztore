/** A part of an image, in its own pixels. */
export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Photos go up at most this size on their longest side: the server makes them 1600 px WebP. */
const UPLOAD_MAX = 2400;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The image didn't load"));
    image.src = src;
  });
}

/**
 * A photo ready to upload: cut to `crop` when given, and no bigger than 2400 px, as a JPEG. A
 * 12 MB photo from a phone becomes a few hundred KB, under the server's 6 MB limit. When the
 * browser can't read it (an odd format), the file goes as it is and the server decides.
 */
export async function preparePhoto(source: File | string, crop?: CropArea): Promise<Blob> {
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  try {
    const image = await loadImage(url);
    const area = crop ?? { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight };
    const scale = Math.min(1, UPLOAD_MAX / Math.max(area.width, area.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(area.width * scale));
    canvas.height = Math.max(1, Math.round(area.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No canvas");
    context.drawImage(
      image,
      area.x,
      area.y,
      area.width,
      area.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );
    if (!blob) throw new Error("No image");
    return blob;
  } catch (error) {
    if (typeof source !== "string") return source;
    throw error;
  } finally {
    if (typeof source !== "string") URL.revokeObjectURL(url);
  }
}

/**
 * The biggest part of a `width` × `height` image with the shape `aspect` (width / height),
 * zoomed in `zoom` times, around `center` (fractions of the image), kept inside the image.
 */
export function cropAreaOf(
  image: { width: number; height: number },
  aspect: number,
  zoom: number,
  center: { x: number; y: number },
): CropArea {
  let width = image.width;
  let height = width / aspect;
  if (height > image.height) {
    height = image.height;
    width = height * aspect;
  }
  width /= zoom;
  height /= zoom;
  const x = Math.min(Math.max(center.x * image.width - width / 2, 0), image.width - width);
  const y = Math.min(Math.max(center.y * image.height - height / 2, 0), image.height - height);
  return { x, y, width, height };
}
