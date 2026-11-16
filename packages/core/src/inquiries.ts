import type { InquiryInput, InquiryStatus, PageBlock } from "@monaztore/contracts";
import { and, count, desc, eq, schema } from "@monaztore/db";
import { NotFoundError } from "./errors";
import type { StorefrontContext } from "./storefront";
import type { TenantContext } from "./tenant";

/**
 * Requests shoppers send from a page's form block ("socks with my dog's face"). The storefront
 * keeps them; the team reads, answers (email or WhatsApp) and marks them done in Requests.
 */

export const INQUIRIES_PAGE_SIZE = 20;

export interface InquiryRow {
  id: string;
  pageId: string | null;
  pageTitle: string;
  name: string;
  email: string;
  phone: string;
  message: string;
  status: InquiryStatus;
  createdAt: Date;
}

export interface InquiryList {
  inquiries: InquiryRow[];
  total: number;
  counts: Record<InquiryStatus, number>;
}

const columns = {
  id: schema.storeInquiry.id,
  pageId: schema.storeInquiry.pageId,
  pageTitle: schema.storeInquiry.pageTitle,
  name: schema.storeInquiry.name,
  email: schema.storeInquiry.email,
  phone: schema.storeInquiry.phone,
  message: schema.storeInquiry.message,
  status: schema.storeInquiry.status,
  createdAt: schema.storeInquiry.createdAt,
};

/**
 * Keeps a shopper's request. Only a published page of this store with a form block of that id
 * takes one: a post to any other address is a 404, like the page itself.
 */
export async function submitInquiry(
  ctx: StorefrontContext,
  pageSlug: string,
  input: InquiryInput,
): Promise<{ id: string; pageTitle: string }> {
  const [page] = await ctx.db
    .select({ id: schema.page.id, title: schema.page.title, blocks: schema.page.blocks })
    .from(schema.page)
    .where(
      and(
        eq(schema.page.organizationId, ctx.store.organizationId),
        eq(schema.page.slug, pageSlug),
        eq(schema.page.status, "published"),
      ),
    );
  const blocks = (page?.blocks ?? []) as PageBlock[];
  if (!page || !blocks.some((block) => block.type === "form" && block.id === input.blockId)) {
    throw new NotFoundError("Form");
  }
  const [row] = await ctx.db
    .insert(schema.storeInquiry)
    .values({
      organizationId: ctx.store.organizationId,
      pageId: page.id,
      pageTitle: page.title,
      name: input.name,
      email: input.email,
      phone: input.phone,
      message: input.message,
    })
    .returning({ id: schema.storeInquiry.id });
  if (!row) throw new Error("Failed to save the request");
  return { id: row.id, pageTitle: page.title };
}

/** Requests by state (`all` for every one), the newest first, with how many of each. */
export async function listInquiries(
  ctx: TenantContext,
  { status = "new", page = 1 }: { status?: InquiryStatus | "all"; page?: number } = {},
): Promise<InquiryList> {
  const own = eq(schema.storeInquiry.organizationId, ctx.organizationId);
  const where = status === "all" ? own : and(own, eq(schema.storeInquiry.status, status));
  const [rows, grouped] = await Promise.all([
    ctx.db
      .select(columns)
      .from(schema.storeInquiry)
      .where(where)
      .orderBy(desc(schema.storeInquiry.createdAt))
      .limit(INQUIRIES_PAGE_SIZE)
      .offset((Math.max(1, page) - 1) * INQUIRIES_PAGE_SIZE),
    ctx.db
      .select({ status: schema.storeInquiry.status, n: count() })
      .from(schema.storeInquiry)
      .where(own)
      .groupBy(schema.storeInquiry.status),
  ]);
  const counts: Record<InquiryStatus, number> = { new: 0, done: 0 };
  for (const { status: key, n } of grouped) {
    if (key === "new" || key === "done") counts[key] = n;
  }
  return {
    inquiries: rows as InquiryRow[],
    total: status === "all" ? counts.new + counts.done : counts[status],
    counts,
  };
}

/** How many requests wait for an answer: the workspace's home and Store show it. */
export async function countNewInquiries(ctx: TenantContext): Promise<number> {
  const [row] = await ctx.db
    .select({ n: count() })
    .from(schema.storeInquiry)
    .where(
      and(
        eq(schema.storeInquiry.organizationId, ctx.organizationId),
        eq(schema.storeInquiry.status, "new"),
      ),
    );
  return row?.n ?? 0;
}

export async function getInquiry(ctx: TenantContext, id: string): Promise<InquiryRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await ctx.db
    .select(columns)
    .from(schema.storeInquiry)
    .where(
      and(
        eq(schema.storeInquiry.organizationId, ctx.organizationId),
        eq(schema.storeInquiry.id, id),
      ),
    );
  return (row as InquiryRow | undefined) ?? null;
}

/** Marks a request done (answered) or back to new. */
export async function setInquiryStatus(
  ctx: TenantContext,
  id: string,
  status: InquiryStatus,
): Promise<void> {
  if (!(await getInquiry(ctx, id))) throw new NotFoundError("Request");
  await ctx.db
    .update(schema.storeInquiry)
    .set({ status })
    .where(
      and(
        eq(schema.storeInquiry.organizationId, ctx.organizationId),
        eq(schema.storeInquiry.id, id),
      ),
    );
}

/** Removes a request for good (spam that got through, a test). */
export async function deleteInquiry(ctx: TenantContext, id: string): Promise<void> {
  if (!(await getInquiry(ctx, id))) throw new NotFoundError("Request");
  await ctx.db
    .delete(schema.storeInquiry)
    .where(
      and(
        eq(schema.storeInquiry.organizationId, ctx.organizationId),
        eq(schema.storeInquiry.id, id),
      ),
    );
}
