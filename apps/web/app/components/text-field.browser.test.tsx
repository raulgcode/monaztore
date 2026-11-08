import { getFormProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
import { magicLinkSchema } from "@monaztore/contracts";
import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderTranslated } from "~/test/i18n";
import { TextField } from "./text-field";

function SignInForm() {
  const [form, fields] = useForm({
    shouldValidate: "onBlur",
    onValidate: ({ formData }) => parseWithZod(formData, { schema: magicLinkSchema }),
  });
  return (
    <form {...getFormProps(form)}>
      <TextField
        field={fields.email}
        label="Email"
        type="email"
        description="We'll send you a link"
      />
      <button type="submit">Send</button>
    </form>
  );
}

describe("TextField", () => {
  it("links the label and the description to the input", async () => {
    const screen = await renderTranslated(<SignInForm />, { namespaces: ["forms"] });
    const input = screen.getByRole("textbox", { name: "Email" });

    await expect.element(input).toHaveAccessibleDescription("We'll send you a link");
    await expect.element(input).not.toHaveAttribute("aria-invalid");
  });

  it("shows the Zod message and marks the input invalid on blur", async () => {
    const screen = await renderTranslated(<SignInForm />, { namespaces: ["forms"] });
    const input = screen.getByRole("textbox", { name: "Email" });

    await userEvent.fill(input, "not-an-email");
    await userEvent.tab();

    await expect.element(page.getByText("Enter a valid email")).toBeVisible();
    await expect.element(input).toHaveAttribute("aria-invalid", "true");
    await expect.element(input).toHaveAccessibleDescription(/Enter a valid email/);
  });

  it("shows the error in the page's language", async () => {
    const screen = await renderTranslated(<SignInForm />, { locale: "es", namespaces: ["forms"] });
    const input = screen.getByRole("textbox", { name: "Email" });

    await userEvent.fill(input, "no-es-correo");
    await userEvent.tab();

    await expect.element(input).toHaveAccessibleDescription(/Escribe un correo válido/);
  });
});
