import { mcpUrl } from "@monaztore/contracts";
import { listAiConnections, removeAiConnection } from "@monaztore/core";
import { BotIcon, CopyIcon } from "lucide-react";
import { useState } from "react";
import { data, useFetcher } from "react-router";
import { PageHeader } from "~/components/page-header";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { sessionContext } from "~/context";
import { metaT, useLocale, useT } from "~/lib/i18n";
import { translations } from "~/lib/locale.server";
import { db, env } from "~/lib/services.server";
import type { Route } from "./+types/ai";

export function meta({ matches }: Route.MetaArgs) {
  return [{ title: metaT(matches)("ai.title") }];
}

/** The assistants are the person's, in every store they're on: support never touches them. */
function personOf(context: Route.LoaderArgs["context"]) {
  const { session, user } = context.get(sessionContext);
  if (session.impersonatedBy) throw data("Not during support", { status: 404 });
  return user;
}

export async function loader({ context }: Route.LoaderArgs) {
  const user = personOf(context);
  return {
    address: mcpUrl(env.API_URL),
    connections: await listAiConnections(db, user.id),
    i18n: translations(context, "ai"),
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = personOf(context);
  const formData = await request.formData();
  const clientId = String(formData.get("clientId") ?? "");
  const name = String(formData.get("name") ?? "");
  if (!clientId) throw data("Which assistant?", { status: 400 });
  const removed = await removeAiConnection(db, user.id, clientId);
  return { removed: removed ? name : null };
}

export default function AiAssistants({ loaderData }: Route.ComponentProps) {
  const t = useT();
  const locale = useLocale();
  const { address, connections } = loaderData;
  const [copied, setCopied] = useState(false);
  const remove = useFetcher<typeof action>();
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" });

  return (
    <>
      <PageHeader title={t("ai.title")} description={t("ai.intro")} />
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>{t("ai.addressTitle")}</h2>
            </CardTitle>
            <CardDescription>{t("ai.addressHelp")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Label htmlFor="mcp-address">{t("ai.address")}</Label>
            <div className="flex gap-2">
              <Input
                id="mcp-address"
                readOnly
                value={address}
                className="min-h-11 font-mono"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={async () => {
                  await navigator.clipboard.writeText(address);
                  setCopied(true);
                }}
              >
                <CopyIcon aria-hidden className="size-4" />
                {copied ? t("ai.copied") : t("ai.copy")}
              </Button>
            </div>
          </CardContent>
        </Card>
        <section aria-labelledby="ai-connected" className="grid gap-3">
          <h2 id="ai-connected" className="text-lg font-semibold">
            {t("ai.connected")}
          </h2>
          {remove.data?.removed ? (
            <p role="status" className="rounded-md border p-3 text-sm">
              {t("ai.removed", { name: remove.data.removed })}
            </p>
          ) : null}
          {connections.length === 0 ? (
            <p className="text-muted-foreground">{t("ai.none")}</p>
          ) : (
            <ul className="grid gap-3">
              {connections.map((connection) => {
                const name = connection.name ?? t("ai.unknownClient");
                return (
                  <li
                    key={connection.clientId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <BotIcon aria-hidden className="size-6 shrink-0 text-primary" />
                      <div className="grid min-w-0 gap-0.5">
                        <p className="truncate font-medium">{name}</p>
                        <p className="text-sm text-muted-foreground">
                          {t("ai.connectedOn", {
                            date: date.format(new Date(connection.connectedAt)),
                          })}
                          {connection.lastUsedAt
                            ? ` · ${t("ai.lastUsed", { date: date.format(new Date(connection.lastUsedAt)) })}`
                            : null}
                        </p>
                      </div>
                    </div>
                    <remove.Form method="post">
                      <input type="hidden" name="clientId" value={connection.clientId} />
                      <input type="hidden" name="name" value={name} />
                      <Button
                        type="submit"
                        variant="outline"
                        className="min-h-11"
                        aria-label={t("ai.removeLabel", { name })}
                        disabled={remove.state !== "idle"}
                      >
                        {t("ai.remove")}
                      </Button>
                    </remove.Form>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
