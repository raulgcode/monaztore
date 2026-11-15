ALTER TABLE "order" ADD COLUMN "shipping_method" jsonb;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "shipping_fee" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "shipping" jsonb DEFAULT '{}'::jsonb NOT NULL;