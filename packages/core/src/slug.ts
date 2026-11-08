export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Organization slugs must be unique; a short random suffix avoids collisions between same-named workspaces. */
export function uniqueSlug(name: string): string {
  return `${slugify(name) || "workspace"}-${crypto.randomUUID().slice(0, 6)}`;
}
