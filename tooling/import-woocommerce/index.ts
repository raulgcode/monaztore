/**
 * Brings a WooCommerce shop into a Monaztore store:
 *
 *   pnpm import:woocommerce --url https://superchivacr.com --store <store-slug>
 *
 * With `WOOCOMMERCE_KEY` and `WOOCOMMERCE_SECRET` in `.env` (WooCommerce → Settings →
 * Advanced → REST API, "Read" permission) it brings everything: drafts, stock, SEO from Yoast or
 * Rank Math, variations and customers. Without them it reads the public Store API (what any
 * visitor sees). It only reads the shop, never writes to it, and can run as often as needed:
 * a second run updates what the first one brought.
 *
 *   --dry-run            reads the shop and prints what it would import, writes nothing
 *   --out catalog.json   also saves what it read (to review it or import it elsewhere)
 *   --from catalog.json  imports a file saved with --out instead of reading the shop
 *   --currency CRC       when the shop's currency can't be read
 *   --no-customers       leaves customers out
 *   --keep-image-urls    links the photos where they are instead of copying them
 *
 * The photos are copied to the store's own files (R2 with R2_*, FILES_DIR on disk without them),
 * re-encoded as WebP, so the store doesn't depend on the old site. Node's fetch only goes
 * through a proxy with NODE_USE_ENV_PROXY=1.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { type ImportedCatalog, importedCatalogSchema } from "@monaztore/contracts";
import { copyCatalogImages, importCatalog, ownerContextForStore } from "@monaztore/core";
import { createDatabase } from "@monaztore/db";
import {
  databaseEnvSchema,
  filesEnvSchema,
  loadDotEnv,
  parseEnv,
  r2Credentials,
} from "@monaztore/env";
import { fetchWooCommerceCatalog } from "@monaztore/importer-woocommerce";
import { createFileStore } from "@monaztore/storage";
import { downloadImage, webImage } from "@monaztore/storage/images";

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

const { values } = parseArgs({
  options: {
    url: { type: "string" },
    store: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    out: { type: "string" },
    from: { type: "string" },
    currency: { type: "string" },
    "no-customers": { type: "boolean", default: false },
    "keep-image-urls": { type: "boolean", default: false },
  },
});

loadDotEnv();

let catalog: ImportedCatalog;
if (values.from) {
  const parsed = importedCatalogSchema.safeParse(JSON.parse(readFileSync(values.from, "utf8")));
  if (!parsed.success) fail(`${values.from} isn't a catalog saved with --out`);
  catalog = parsed.data;
} else {
  if (!values.url)
    fail("Usage: pnpm import:woocommerce --url https://shop.com --store <store-slug>");
  const consumerKey = process.env.WOOCOMMERCE_KEY;
  const consumerSecret = process.env.WOOCOMMERCE_SECRET;
  console.log(
    `▸ Reading ${values.url} ${consumerKey ? "with keys (REST API v3)" : "without keys (public Store API)"}`,
  );
  try {
    catalog = await fetchWooCommerceCatalog({
      url: values.url,
      consumerKey,
      consumerSecret,
      currency: values.currency,
      skipCustomers: values["no-customers"],
      onProgress: (message) => console.log(`  ${message}`),
    });
  } catch (error) {
    fail((error as Error).message);
  }
  const checked = importedCatalogSchema.safeParse(catalog);
  if (!checked.success) {
    const [issue] = checked.error.issues;
    fail(`The shop answered something unexpected at ${issue?.path.join(".")}: ${issue?.message}`);
  }
}

console.log(
  `  ${catalog.categories.length} categories · ${catalog.products.length} products · ` +
    `${catalog.products.reduce((sum, p) => sum + p.variants.length, 0)} variants · ` +
    `${catalog.customers.length} customers · ${catalog.pages?.length ?? 0} pages · ${catalog.currency}`,
);
for (const warning of catalog.warnings) console.log(`  ⚠ ${warning}`);

if (values.out) {
  writeFileSync(values.out, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(`  ✓ Saved to ${values.out}`);
}

if (values["dry-run"]) {
  console.log("\nDry run: nothing was written.");
  process.exit(0);
}
if (!values.store) {
  if (values.out) process.exit(0);
  fail("Say which store receives the catalog: --store <store-slug> (or --dry-run)");
}

const env = parseEnv(databaseEnvSchema);
const { db, close } = createDatabase(env.DATABASE_URL);
try {
  const ctx = await ownerContextForStore(db, values.store);
  if (!ctx) fail(`There is no store "${values.store}" with an owner`);
  if (!values["keep-image-urls"]) {
    const filesEnv = parseEnv(filesEnvSchema);
    const files = createFileStore({ r2: r2Credentials(filesEnv), dir: filesEnv.FILES_DIR });
    console.log(`\n▸ Copying the photos to the store's files (${files.kind})`);
    const copy = await copyCatalogImages(ctx, catalog, {
      files,
      download: (url) => downloadImage(url),
      convert: (bytes) => webImage(bytes),
      onProgress: (done, total) => {
        if (done % 50 === 0 || done === total) console.log(`  ${done}/${total} photos`);
      },
    });
    catalog = copy.catalog;
    console.log(`  ✓ ${copy.copied} copied${copy.failed ? `, ${copy.failed} failed` : ""}`);
    for (const warning of catalog.warnings.filter((w) => w.startsWith("Couldn't copy"))) {
      console.log(`  ⚠ ${warning}`);
    }
  }

  console.log(`\n▸ Importing into ${values.store}`);
  const result = await importCatalog(ctx, catalog);
  console.log(
    `  ✓ ${result.stats.categories} categories, ${result.stats.products} products, ` +
      `${result.stats.variants} variants, ${result.stats.images} images, ` +
      `${result.stats.customers} customers, ${result.stats.pages} pages, ${result.stats.redirects} redirects (run ${result.runId})`,
  );
} finally {
  await close();
}
