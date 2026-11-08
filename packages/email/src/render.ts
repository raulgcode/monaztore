/// <reference path="./mjml.d.ts" />
import { renderToMjml } from "@faire/mjml-react/utils/renderToMjml.js";
import { convert } from "html-to-text";
import mjml2html from "mjml";
import type { ReactElement } from "react";

export interface RenderedEmail {
  html: string;
  text: string;
}

/** Turns a template (an `EmailLayout` element) into the HTML and the plain text of the email. */
export async function renderEmail(email: ReactElement): Promise<RenderedEmail> {
  const { html, errors } = await mjml2html(renderToMjml(email), {
    validationLevel: "strict",
    keepComments: false,
  });
  if (errors.length > 0) {
    throw new Error(`Invalid MJML: ${errors.map((error) => error.formattedMessage).join("; ")}`);
  }
  const text = convert(html, {
    wordwrap: false,
    selectors: [
      // The inbox preview line is not part of the text, and the button already prints its link.
      { selector: "div[style*='display:none']", format: "skip" },
      { selector: ".app-fallback", format: "skip" },
      { selector: "img", format: "skip" },
      { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
    ],
  });
  return { html, text };
}
