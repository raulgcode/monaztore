import { z } from "zod/mini";
import { message } from "./message";

export const createWorkspaceSchema = z.object({
  name: z
    .string({ error: message("forms.workspaceNameRequired") })
    .check(
      z.trim(),
      z.minLength(2, message("forms.workspaceNameTooShort")),
      z.maxLength(80, message("forms.workspaceNameTooLong")),
    ),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
