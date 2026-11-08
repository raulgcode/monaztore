import { asc, eq, inArray, schema, sql } from "@monaztore/db";
import { data, Form, href, redirect } from "react-router";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { requireDevTools } from "~/lib/dev-tools.server";
import { auth, db } from "~/lib/services.server";
import type { Route } from "./+types/sign-in";

// A local tool in English only: it never reaches a production build (see dev-tools.server.ts).

export function meta(_: Route.MetaArgs) {
  return [{ title: "Sign in as… · Dev" }, { name: "robots", content: "noindex" }];
}

const like = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;

/** Every user (filtered by `?q=`) with their workspaces, to enter as any of them without an email. */
export async function loader({ request, url }: Route.LoaderArgs) {
  requireDevTools(request);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const session = await auth.api.getSession({ headers: request.headers });
  const users = await db
    .select({ id: schema.user.id, name: schema.user.name, email: schema.user.email })
    .from(schema.user)
    .where(
      q
        ? sql`${schema.user.name} ilike ${like(q)} or ${schema.user.email} ilike ${like(q)}`
        : undefined,
    )
    .orderBy(asc(schema.user.createdAt))
    .limit(50);
  const memberships = users.length
    ? await db
        .select({ userId: schema.member.userId, name: schema.organization.name })
        .from(schema.member)
        .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
        .where(
          inArray(
            schema.member.userId,
            users.map((user) => user.id),
          ),
        )
    : [];
  return {
    q,
    current: session?.user.email ?? null,
    users: users.map((user) => ({
      ...user,
      workspaces: memberships.filter((m) => m.userId === user.id).map((m) => m.name),
    })),
  };
}

export async function action({ request }: Route.ActionArgs) {
  requireDevTools(request);
  const userId = String((await request.formData()).get("userId") ?? "");
  if (!userId) throw data("User not found", { status: 404 });
  const { headers } = await auth.api.devSignIn({ body: { userId }, returnHeaders: true });
  return redirect(href("/app"), { headers });
}

export default function DevSignIn({ loaderData }: Route.ComponentProps) {
  const { q, current, users } = loaderData;
  return (
    <main className="mx-auto grid max-w-3xl gap-6 px-4 py-8">
      <header className="grid gap-1">
        <p className="text-sm font-medium text-muted-foreground">Local tool · pnpm dev</p>
        <h1 className="text-2xl font-semibold">Sign in as…</h1>
        <p className="text-sm text-muted-foreground">
          {current ? `You are signed in as ${current}.` : "You are not signed in."}
        </p>
      </header>
      <Form method="get" className="flex items-end gap-2">
        <div className="grid flex-1 gap-2">
          <Label htmlFor="q">Search by name or email</Label>
          <Input id="q" name="q" type="search" defaultValue={q} />
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </Form>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Users</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody with that name or email.</p>
          ) : (
            <ul className="divide-y">
              {users.map((user) => (
                <li key={user.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{user.name || user.email}</p>
                    <p className="truncate text-sm text-muted-foreground">{user.email}</p>
                    {user.workspaces.length > 0 ? (
                      <p className="truncate text-sm text-muted-foreground">
                        {user.workspaces.join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  <Form method="post">
                    <input type="hidden" name="userId" value={user.id} />
                    <Button type="submit" aria-label={`Sign in as ${user.email}`}>
                      Sign in
                    </Button>
                  </Form>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
