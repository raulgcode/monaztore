import { z } from "zod/mini";
import { message } from "./message";

/** Better Auth's limits for a password (scrypt hashes up to 128 characters). */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

// Lowercased, so the same person never ends up with two accounts.
const email = z.pipe(
  z.string({ error: message("forms.emailRequired") }).check(z.trim(), z.toLowerCase()),
  z.email({ error: message("forms.emailInvalid") }),
);

const newPassword = z
  .string({ error: message("forms.passwordRequired") })
  .check(
    z.minLength(PASSWORD_MIN, message("forms.passwordTooShort")),
    z.maxLength(PASSWORD_MAX, message("forms.passwordTooLong")),
  );

/** The magic link: just the email. */
export const magicLinkSchema = z.object({ email });
export type MagicLinkInput = z.infer<typeof magicLinkSchema>;

export const passwordSignInSchema = z.object({
  email,
  password: z
    .string({ error: message("forms.passwordRequired") })
    .check(z.minLength(1, message("forms.passwordRequired"))),
});
export type PasswordSignInInput = z.infer<typeof passwordSignInSchema>;

export const signUpSchema = z.object({
  name: z
    .string({ error: message("forms.nameRequired") })
    .check(
      z.trim(),
      z.minLength(1, message("forms.nameRequired")),
      z.maxLength(80, message("forms.nameTooLong")),
    ),
  email,
  password: newPassword,
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({
  token: z.string().check(z.minLength(1)),
  password: newPassword,
});
