/** Who a project is: what `pnpm rename` rewrites from and to. */
export interface Identity {
  /** As people read it: "Superchiva". */
  name: string;
  /** Package scope, databases and Fly apps: "superchiva". */
  slug: string;
  /** Production domain: "superchiva.cr". */
  domain: string;
}

/**
 * What's wrong with a new identity, one line per field. The slug ends up in JavaScript names
 * (`__superchivaDatabase`) and Postgres users, so it is lowercase letters and digits only.
 */
export function identityProblems(identity: Identity): string[] {
  const problems: string[] = [];
  if (!identity.name.trim()) problems.push("name: write how people read it, like Superchiva");
  if (!/^[a-z][a-z0-9]{1,38}$/.test(identity.slug)) {
    problems.push("slug: lowercase letters and digits, starting with a letter, like superchiva");
  }
  if (!/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(identity.domain)) {
    problems.push("domain: only the domain, like superchiva.cr");
  }
  return problems;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The text with the old identity swapped for the new one: domain, name and slug, in one pass
 * (longest first), so a new name that holds the old one is never renamed twice.
 */
export function renameText(text: string, from: Identity, to: Identity): string {
  const swaps = new Map([
    [from.domain, to.domain],
    [from.name, to.name],
    [from.slug, to.slug],
  ]);
  const pattern = new RegExp(
    [...swaps.keys()]
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp)
      .join("|"),
    "g",
  );
  return text.replace(pattern, (found) => swaps.get(found) ?? found);
}
