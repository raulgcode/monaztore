import { Form } from "react-router";
import { GoogleIcon } from "~/components/google-icon";
import { Button } from "~/components/ui/button";
import { useT } from "~/lib/i18n";

/** "Continue with Google": a native POST, so the OAuth state cookie and the redirect work without JS. */
export function GoogleButton() {
  const t = useT();
  return (
    <Form method="post" reloadDocument>
      <input type="hidden" name="intent" value="google" />
      <Button type="submit" variant="outline" className="w-full">
        <GoogleIcon />
        {t("forms.continueWithGoogle")}
      </Button>
    </Form>
  );
}

/** The line between Google and the email forms. */
export function OrWithEmail() {
  const t = useT();
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      {t("forms.orWithEmail")}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
