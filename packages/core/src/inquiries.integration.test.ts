import type { PageBlock } from "@monaztore/contracts";
import { createTestDatabase, createTestTenant } from "@monaztore/db/testing";
import { afterAll, describe, expect, it } from "vitest";
import {
  countNewInquiries,
  deleteInquiry,
  getInquiry,
  listInquiries,
  setInquiryStatus,
  submitInquiry,
} from "./inquiries";
import { createPage } from "./pages";
import type { StorefrontContext } from "./storefront";
import { resolveTenant } from "./workspaces";

const connection = createTestDatabase();
afterAll(() => connection.close());
const db = connection.db;

const blocks: PageBlock[] = [
  {
    type: "form",
    id: "request",
    title: "Pide tus medias",
    text: "",
    messageLabel: "",
    buttonLabel: "",
  },
];

async function storeWithForm(status: "published" | "draft" = "published") {
  const tenant = await createTestTenant(db);
  const ctx = await resolveTenant(db, tenant.userId, tenant.slug);
  if (!ctx) throw new Error("no tenant");
  await createPage(ctx, {
    title: "Medias personalizadas",
    slug: "medias",
    seoTitle: "",
    seoDescription: "",
    status,
    blocks,
  });
  const store: StorefrontContext = {
    db,
    store: {
      organizationId: ctx.organizationId,
      name: "Chiva",
      slug: tenant.slug,
      hostname: "c.cr",
    },
  };
  return { ctx, store };
}

const request = (overrides: Record<string, string> = {}) => ({
  blockId: "request",
  name: "Ana",
  email: "ana@example.com",
  phone: "8888 0000",
  message: "Con la cara de mi perro",
  ...overrides,
});

describe("requests from a page's form", () => {
  it("keeps a shopper's request with its page, and the team reads, answers and deletes it", async () => {
    const { ctx, store } = await storeWithForm();
    const { id, pageTitle } = await submitInquiry(store, "medias", request());
    expect(pageTitle).toBe("Medias personalizadas");
    expect(await countNewInquiries(ctx)).toBe(1);

    const list = await listInquiries(ctx);
    expect(list.inquiries).toMatchObject([
      { id, name: "Ana", message: "Con la cara de mi perro", pageTitle: "Medias personalizadas" },
    ]);
    expect(list.counts).toEqual({ new: 1, done: 0 });

    await setInquiryStatus(ctx, id, "done");
    expect(await countNewInquiries(ctx)).toBe(0);
    expect((await listInquiries(ctx, { status: "done" })).inquiries).toHaveLength(1);
    expect((await listInquiries(ctx, { status: "new" })).inquiries).toHaveLength(0);

    await deleteInquiry(ctx, id);
    expect(await getInquiry(ctx, id)).toBeNull();
  });

  it("refuses a form that isn't on a published page of the store", async () => {
    const { store } = await storeWithForm("draft");
    await expect(submitInquiry(store, "medias", request())).rejects.toMatchObject({
      name: "NotFoundError",
    });
    const published = await storeWithForm();
    await expect(
      submitInquiry(published.store, "medias", request({ blockId: "other" })),
    ).rejects.toMatchObject({ name: "NotFoundError" });
    await expect(submitInquiry(published.store, "nope", request())).rejects.toMatchObject({
      name: "NotFoundError",
    });
  });

  it("never shows another store's requests nor lets it change them", async () => {
    const mine = await storeWithForm();
    const theirs = await storeWithForm();
    const { id } = await submitInquiry(mine.store, "medias", request());

    expect((await listInquiries(theirs.ctx, { status: "all" })).inquiries).toEqual([]);
    expect(await getInquiry(theirs.ctx, id)).toBeNull();
    await expect(setInquiryStatus(theirs.ctx, id, "done")).rejects.toMatchObject({
      name: "NotFoundError",
    });
    await expect(deleteInquiry(theirs.ctx, id)).rejects.toMatchObject({ name: "NotFoundError" });
    expect(await countNewInquiries(mine.ctx)).toBe(1);
  });
});
