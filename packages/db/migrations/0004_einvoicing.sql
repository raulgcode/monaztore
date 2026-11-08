CREATE TABLE "einvoice" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"order_id" uuid,
	"order_number" integer NOT NULL,
	"kind" text NOT NULL,
	"environment" text NOT NULL,
	"number" integer NOT NULL,
	"consecutive" text NOT NULL,
	"clave" text NOT NULL,
	"security_code" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"receiver" jsonb,
	"currency" text NOT NULL,
	"total" bigint NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"signed_xml" text,
	"response_xml" text,
	"problem" text,
	"message" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_until" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"emailed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_einvoicing" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"auto_issue" boolean DEFAULT true NOT NULL,
	"id_type" text,
	"id_number" text,
	"name" text DEFAULT '' NOT NULL,
	"commercial_name" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"activity_code" text DEFAULT '' NOT NULL,
	"province" text DEFAULT '' NOT NULL,
	"canton" text DEFAULT '' NOT NULL,
	"district" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"cabys" text DEFAULT '' NOT NULL,
	"cabys_description" text DEFAULT '' NOT NULL,
	"branch" integer DEFAULT 1 NOT NULL,
	"terminal" integer DEFAULT 1 NOT NULL,
	"hacienda_username" text DEFAULT '' NOT NULL,
	"hacienda_password" text,
	"certificate" text,
	"certificate_pin" text,
	"certificate_subject" text,
	"certificate_expires_at" timestamp with time zone,
	"next_invoice_number" integer DEFAULT 1 NOT NULL,
	"next_ticket_number" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "tax_id" jsonb;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "country" text DEFAULT 'CR' NOT NULL;--> statement-breakpoint
ALTER TABLE "einvoice" ADD CONSTRAINT "einvoice_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "einvoice" ADD CONSTRAINT "einvoice_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_einvoicing" ADD CONSTRAINT "store_einvoicing_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "einvoice_clave_idx" ON "einvoice" USING btree ("clave");--> statement-breakpoint
CREATE UNIQUE INDEX "einvoice_consecutive_idx" ON "einvoice" USING btree ("organization_id","environment","consecutive");--> statement-breakpoint
CREATE UNIQUE INDEX "einvoice_order_idx" ON "einvoice" USING btree ("order_id") WHERE "einvoice"."status" <> 'rejected';--> statement-breakpoint
CREATE INDEX "einvoice_organization_idx" ON "einvoice" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "einvoice_due_idx" ON "einvoice" USING btree ("status","next_attempt_at");