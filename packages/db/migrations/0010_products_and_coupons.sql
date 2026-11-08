CREATE TABLE "coupon" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"amount" bigint NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"usage_limit" integer,
	"usage_limit_per_customer" integer,
	"min_subtotal" bigint,
	"product_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"category_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exclude_sale_items" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "discount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "coupon_code" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "coupon_id" uuid;--> statement-breakpoint
ALTER TABLE "order_line" ADD COLUMN "discount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "sale_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "sale_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "product_option" ADD COLUMN "variation" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "coupon" ADD CONSTRAINT "coupon_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_code_idx" ON "coupon" USING btree ("organization_id","code");--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_coupon_id_coupon_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupon"("id") ON DELETE set null ON UPDATE no action;