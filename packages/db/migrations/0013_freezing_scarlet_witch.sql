ALTER TABLE "order" ADD COLUMN "follow_token_hashes" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "fulfillment" text DEFAULT 'unfulfilled' NOT NULL;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "tracking_number" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "shipped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "delivered_at" timestamp with time zone;