/**
 * The project's name and domain, in one place. `pnpm rename` reads it to know what to rewrite
 * and leaves it with the new values; the code reads it where the name shows (the sign-in app,
 * the API docs, the error page) or a host is needed. No dependencies: the browser imports it too.
 */
export const project = {
  /** As people read it: titles, emails, "made with". */
  name: "Monaztore",
  /** Lowercase letters and digits: package scope (`@monaztore/…`), databases, Fly apps. */
  slug: "monaztore",
  /** The production domain: the panel answers on `app.`, the API on `api.`. */
  domain: "monaztore.com",
} as const;

export const appHost = `app.${project.domain}`;
export const apiHost = `api.${project.domain}`;
