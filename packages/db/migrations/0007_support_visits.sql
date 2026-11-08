ALTER TYPE "public"."platform_audit_action" ADD VALUE 'support_started';--> statement-breakpoint
ALTER TYPE "public"."platform_audit_action" ADD VALUE 'support_ended';--> statement-breakpoint
ALTER TYPE "public"."platform_audit_action" ADD VALUE 'support_change';--> statement-breakpoint
CREATE TABLE "support_visit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"admin_user_id" uuid,
	"organization_id" uuid NOT NULL,
	"target_user_id" uuid,
	"read_only" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "support_visit" ADD CONSTRAINT "support_visit_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_visit" ADD CONSTRAINT "support_visit_admin_user_id_user_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_visit" ADD CONSTRAINT "support_visit_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_visit" ADD CONSTRAINT "support_visit_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_visit_session_idx" ON "support_visit" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "support_visit_organization_idx" ON "support_visit" USING btree ("organization_id","started_at");