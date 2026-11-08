import { type FieldMetadata, getInputProps } from "@conform-to/react";
import type * as React from "react";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { translateText, useT } from "~/lib/i18n";
import { cn } from "~/lib/utils";

type InputType =
  | "text"
  | "email"
  | "number"
  | "tel"
  | "search"
  | "url"
  | "password"
  | "date"
  | "time"
  | "datetime-local";

export interface TextFieldProps
  extends Omit<React.ComponentProps<"input">, "type" | "name" | "id" | "defaultValue"> {
  field: FieldMetadata<string | number | undefined>;
  label: string;
  type?: InputType;
  description?: string;
}

/**
 * Label + input + error list wired to a Conform field. Conform sets id, name,
 * aria-invalid and aria-describedby, so screen readers announce the error.
 */
export function TextField({
  field,
  label,
  type = "text",
  description,
  className,
  ...inputProps
}: TextFieldProps) {
  const descriptionId = description ? `${field.id}-description` : undefined;
  const conformProps = getInputProps(field, { type, ariaDescribedBy: descriptionId });

  return (
    <div className={cn("grid gap-2", className)}>
      <Label htmlFor={field.id}>{label}</Label>
      <Input {...inputProps} {...conformProps} key={conformProps.key} />
      {description ? (
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      <FieldErrors id={field.errorId} errors={field.errors} />
    </div>
  );
}

/** The schema's errors, translated: `@monaztore/contracts` returns them as keys. */
export function FieldErrors({ id, errors }: { id: string; errors: string[] | undefined }) {
  const t = useT();
  if (!errors?.length) return null;
  return (
    <ul id={id} className="text-sm text-destructive">
      {errors.map((error) => (
        <li key={error}>{translateText(t, error)}</li>
      ))}
    </ul>
  );
}
