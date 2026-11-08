import { PRODUCT_IMAGES_MAX } from "@monaztore/contracts";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CropIcon,
  ImagePlusIcon,
  LoaderIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { href, useFetcher } from "react-router";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { useT } from "~/lib/i18n";
import { cn } from "~/lib/utils";
import { type CropArea, cropAreaOf, preparePhoto } from "./image-tools";

export interface ProductPhoto {
  url: string;
  alt: string;
}

interface Upload {
  slot: string;
  /** Replaces this photo (a crop) instead of adding one. */
  replaces?: string;
  blob: Blob;
  name: string;
}

/**
 * The product's photos: added from the phone's camera or gallery (several at once), put in
 * order with the arrows (or dragged, with a mouse), the first is the cover, and each one can be
 * cropped and described for people who don't see it.
 */
export function ProductPhotos({
  workspace,
  photos,
  onChange,
  disabled,
}: {
  workspace: string;
  photos: ProductPhoto[];
  onChange: (photos: ProductPhoto[]) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const inputId = useId();
  const upload = useFetcher<{ slot: string; url: string | null }>();
  const [queue, setQueue] = useState<Upload[]>([]);
  const [failed, setFailed] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [dragged, setDragged] = useState<number | null>(null);
  const latest = useRef(photos);
  latest.current = photos;
  const sent = useRef<Upload | null>(null);

  // One upload at a time; each answer goes in its place, then the next one leaves.
  useEffect(() => {
    if (upload.state !== "idle") return;
    const done = sent.current;
    if (done && upload.data?.slot === done.slot) {
      sent.current = null;
      const url = upload.data.url;
      if (url) {
        const current = latest.current;
        onChange(
          done.replaces
            ? current.map((photo) => (photo.url === done.replaces ? { ...photo, url } : photo))
            : [...current, { url, alt: "" }].slice(0, PRODUCT_IMAGES_MAX),
        );
      } else {
        setFailed((n) => n + 1);
      }
      setQueue((items) => items.filter((item) => item.slot !== done.slot));
      return;
    }
    const next = queue[0];
    if (!next || sent.current) return;
    sent.current = next;
    const body = new FormData();
    body.set("slot", next.slot);
    body.set("file", new File([next.blob], next.name, { type: next.blob.type || "image/jpeg" }));
    upload.submit(body, {
      method: "post",
      encType: "multipart/form-data",
      action: href("/app/:workspace/products/images", { workspace }),
    });
  }, [upload.state, upload.data, queue, workspace, onChange, upload.submit]);

  const add = async (files: FileList | null) => {
    if (!files) return;
    setFailed(0);
    const room = PRODUCT_IMAGES_MAX - photos.length - queue.length;
    const picked = [...files]
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, Math.max(0, room));
    const ready = await Promise.all(
      picked.map(async (file) => ({
        slot: crypto.randomUUID(),
        blob: await preparePhoto(file),
        name: file.name.replace(/\.[^.]+$/, ".jpg"),
      })),
    );
    setQueue((items) => [...items, ...ready]);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= photos.length || from === to) return;
    const next = [...photos];
    const [photo] = next.splice(from, 1);
    if (photo) next.splice(to, 0, photo);
    onChange(next);
  };

  const editingPhoto = photos.find((photo) => photo.url === editing);

  return (
    <div className="grid gap-3">
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label={t("products.photosLabel")}>
        {photos.map((photo, index) => (
          <li
            key={photo.url}
            draggable={!disabled}
            onDragStart={() => setDragged(index)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (dragged !== null) move(dragged, index);
              setDragged(null);
            }}
            className={cn("grid gap-1", dragged === index && "opacity-50")}
          >
            <button
              type="button"
              onClick={() => setEditing(photo.url)}
              disabled={disabled}
              className="relative aspect-square overflow-hidden rounded-md border bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              aria-label={t("products.editPhoto", { number: index + 1 })}
            >
              <img
                src={photo.url}
                alt={photo.alt}
                className="size-full object-cover"
                loading="lazy"
              />
              {index === 0 ? (
                <span className="absolute top-1 left-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                  {t("products.cover")}
                </span>
              ) : null}
            </button>
            <div className="flex justify-between">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled || index === 0}
                onClick={() => move(index, index - 1)}
                aria-label={t("products.moveEarlier", { number: index + 1 })}
              >
                <ArrowLeftIcon aria-hidden className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled || index === photos.length - 1}
                onClick={() => move(index, index + 1)}
                aria-label={t("products.moveLater", { number: index + 1 })}
              >
                <ArrowRightIcon aria-hidden className="size-4" />
              </Button>
            </div>
          </li>
        ))}
        {queue.map((item) =>
          item.replaces ? null : (
            <li
              key={item.slot}
              className="grid aspect-square place-items-center rounded-md border border-dashed"
            >
              <LoaderIcon aria-hidden className="size-5 animate-spin text-muted-foreground" />
              <span className="sr-only">{t("products.uploading")}</span>
            </li>
          ),
        )}
        {photos.length + queue.length < PRODUCT_IMAGES_MAX ? (
          <li>
            <label
              htmlFor={inputId}
              className={cn(
                "grid aspect-square cursor-pointer place-items-center content-center gap-1 rounded-md border border-dashed p-2 text-center text-sm text-muted-foreground hover:bg-accent focus-within:ring-[3px] focus-within:ring-ring/50",
                disabled && "pointer-events-none opacity-50",
              )}
            >
              <ImagePlusIcon aria-hidden className="size-6" />
              {t("products.addPhotos")}
              <input
                id={inputId}
                type="file"
                accept="image/*"
                multiple
                disabled={disabled}
                className="sr-only"
                onChange={(event) => {
                  void add(event.target.files);
                  event.target.value = "";
                }}
              />
            </label>
          </li>
        ) : null}
      </ul>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {queue.length > 0
          ? t("products.uploadingCount", { count: queue.length })
          : failed > 0
            ? t("products.uploadFailed", { count: failed })
            : t("products.photosHint", { max: PRODUCT_IMAGES_MAX })}
      </p>

      {editingPhoto ? (
        <PhotoDialog
          photo={editingPhoto}
          index={photos.indexOf(editingPhoto)}
          onClose={() => setEditing(null)}
          onAlt={(alt) => onChange(photos.map((p) => (p === editingPhoto ? { ...p, alt } : p)))}
          onCover={() => {
            move(photos.indexOf(editingPhoto), 0);
            setEditing(null);
          }}
          onRemove={() => {
            onChange(photos.filter((p) => p !== editingPhoto));
            setEditing(null);
          }}
          onCrop={(blob) => {
            setQueue((items) => [
              ...items,
              { slot: crypto.randomUUID(), replaces: editingPhoto.url, blob, name: "photo.jpg" },
            ]);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

const aspects = [
  { id: "square", value: 1 },
  { id: "portrait", value: 4 / 5 },
  { id: "landscape", value: 4 / 3 },
  { id: "original", value: null },
] as const;

/** One photo: crop it (shape, zoom and drag), describe it, make it the cover or take it out. */
function PhotoDialog({
  photo,
  index,
  onClose,
  onAlt,
  onCover,
  onRemove,
  onCrop,
}: {
  photo: ProductPhoto;
  index: number;
  onClose: () => void;
  onAlt: (alt: string) => void;
  onCover: () => void;
  onRemove: () => void;
  onCrop: (blob: Blob) => void;
}) {
  const t = useT();
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [aspectId, setAspectId] = useState<(typeof aspects)[number]["id"]>("square");
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState({ x: 0.5, y: 0.5 });
  const [saving, setSaving] = useState(false);
  const drag = useRef<{ x: number; y: number } | null>(null);
  // Only the store's own files can be cut: a canvas can't read another site's photo.
  const croppable = photo.url.startsWith("/media/");

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const aspect =
    aspects.find((a) => a.id === aspectId)?.value ?? (natural ? natural.width / natural.height : 1);
  const area: CropArea | null = natural ? cropAreaOf(natural, aspect, zoom, center) : null;

  const pan = (dx: number, dy: number) => {
    if (!natural || !area || !frame.current) return;
    const perPixel = area.width / frame.current.clientWidth;
    setCenter((c) => ({
      x: Math.min(1, Math.max(0, c.x - (dx * perPixel) / natural.width)),
      y: Math.min(1, Math.max(0, c.y - (dy * perPixel) / natural.height)),
    }));
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border bg-background p-0 text-foreground backdrop:bg-black/60"
    >
      <div className="grid max-h-[calc(100dvh-2rem)] gap-4 overflow-y-auto p-4">
        <h2 id={titleId} className="text-lg font-semibold">
          {t("products.photoTitle", { number: index + 1 })}
        </h2>
        {croppable ? (
          <>
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">{t("products.cropShape")}</legend>
              <div className="grid grid-cols-4 gap-1 rounded-md bg-muted p-1">
                {aspects.map((option) => (
                  <label
                    key={option.id}
                    className={cn(
                      "grid min-h-11 cursor-pointer place-items-center rounded-sm text-center text-xs font-medium has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
                      aspectId === option.id ? "bg-background shadow-xs" : "text-muted-foreground",
                    )}
                  >
                    <input
                      type="radio"
                      name="crop-shape"
                      value={option.id}
                      checked={aspectId === option.id}
                      onChange={() => {
                        setAspectId(option.id);
                        setZoom(1);
                        setCenter({ x: 0.5, y: 0.5 });
                      }}
                      className="sr-only"
                    />
                    {t(`products.crop_${option.id}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div
              ref={frame}
              role="application"
              aria-label={t("products.cropArea")}
              // biome-ignore lint/a11y/noNoninteractiveTabindex: the frame is moved with the arrow keys (dragging is extra).
              tabIndex={0}
              className="relative w-full touch-none overflow-hidden rounded-md bg-muted outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              style={{ aspectRatio: String(aspect) }}
              onPointerDown={(event) => {
                drag.current = { x: event.clientX, y: event.clientY };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                if (!drag.current) return;
                pan(event.clientX - drag.current.x, event.clientY - drag.current.y);
                drag.current = { x: event.clientX, y: event.clientY };
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
              onKeyDown={(event) => {
                const step = 10;
                const moves: Record<string, [number, number]> = {
                  ArrowLeft: [step, 0],
                  ArrowRight: [-step, 0],
                  ArrowUp: [0, step],
                  ArrowDown: [0, -step],
                };
                const delta = moves[event.key];
                if (delta) {
                  event.preventDefault();
                  pan(...delta);
                }
              }}
            >
              <img
                src={photo.url}
                alt=""
                draggable={false}
                onLoad={(event) =>
                  setNatural({
                    width: event.currentTarget.naturalWidth,
                    height: event.currentTarget.naturalHeight,
                  })
                }
                className="pointer-events-none absolute max-w-none"
                style={
                  natural && area
                    ? {
                        width: `${(natural.width / area.width) * 100}%`,
                        left: `${(-area.x / area.width) * 100}%`,
                        top: `${(-area.y / area.height) * 100}%`,
                      }
                    : { width: "100%", opacity: 0 }
                }
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-md ring-1 ring-white/70 ring-inset"
              />
            </div>
            <p className="text-sm text-muted-foreground">{t("products.cropHint")}</p>
            <div className="grid gap-2">
              <Label htmlFor={`${titleId}-zoom`}>{t("products.zoom")}</Label>
              <input
                id={`${titleId}-zoom`}
                type="range"
                min={1}
                max={4}
                step={0.05}
                value={zoom}
                onChange={(event) => setZoom(Number(event.target.value))}
                className="h-11 accent-primary"
              />
            </div>
          </>
        ) : (
          <img src={photo.url} alt="" className="w-full rounded-md" />
        )}
        <div className="grid gap-2">
          <Label htmlFor={`${titleId}-alt`}>{t("products.altLabel")}</Label>
          <Input
            id={`${titleId}-alt`}
            defaultValue={photo.alt}
            maxLength={200}
            onChange={(event) => onAlt(event.target.value)}
            aria-describedby={`${titleId}-alt-hint`}
          />
          <p id={`${titleId}-alt-hint`} className="text-sm text-muted-foreground">
            {t("products.altHint")}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" onClick={onCover} disabled={index === 0}>
            <StarIcon aria-hidden className="size-4" />
            {t("products.makeCover")}
          </Button>
          <Button type="button" variant="outline" onClick={onRemove}>
            <Trash2Icon aria-hidden className="size-4" />
            {t("products.removePhoto")}
          </Button>
        </div>
        <div className="sticky bottom-0 -mx-4 -mb-4 grid grid-cols-2 gap-2 border-t bg-background p-4">
          <Button type="button" variant="outline" onClick={() => dialog.current?.close()}>
            {t("products.done")}
          </Button>
          {croppable ? (
            <Button
              type="button"
              disabled={!area || saving}
              onClick={async () => {
                if (!area) return;
                setSaving(true);
                try {
                  onCrop(await preparePhoto(photo.url, area));
                } finally {
                  setSaving(false);
                }
              }}
            >
              <CropIcon aria-hidden className="size-4" />
              {t("products.saveCrop")}
            </Button>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
