CREATE TABLE "order_download" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"order_line_id" uuid NOT NULL,
	"key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" bigint NOT NULL,
	"download_limit" integer,
	"download_days" integer,
	"expires_at" timestamp with time zone,
	"downloads" integer DEFAULT 0 NOT NULL,
	"last_download_at" timestamp with time zone,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_file" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" bigint NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "needs_shipping" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "download_token_hash" text;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "download_limit" integer DEFAULT 5;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "download_days" integer DEFAULT 30;--> statement-breakpoint
ALTER TABLE "order_download" ADD CONSTRAINT "order_download_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_download" ADD CONSTRAINT "order_download_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_download" ADD CONSTRAINT "order_download_order_line_id_order_line_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_line"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_file" ADD CONSTRAINT "product_file_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_file" ADD CONSTRAINT "product_file_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_download_order_idx" ON "order_download" USING btree ("order_id","position");--> statement-breakpoint
CREATE INDEX "product_file_product_idx" ON "product_file" USING btree ("product_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "order_download_token_idx" ON "order" USING btree ("download_token_hash");