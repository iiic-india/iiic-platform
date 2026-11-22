import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_pages_blocks_faq_copy_status" AS ENUM('approved', 'candidate');
  CREATE TYPE "public"."enum__pages_v_blocks_faq_copy_status" AS ENUM('approved', 'candidate');
  CREATE TYPE "public"."enum_faqs_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__faqs_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_services_facts_source" AS ENUM('brochure', 'site', 'form', 'founder', 'description', 'pageCopy', 'counted');
  CREATE TYPE "public"."enum_services_type" AS ENUM('session', 'call', 'info', 'seat');
  CREATE TYPE "public"."enum_services_register" AS ENUM('consultancy', 'education', 'counselling');
  CREATE TYPE "public"."enum_services_format" AS ENUM('online', 'office', 'both');
  CREATE TABLE "pages_blocks_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"anchor" varchar,
  	"copy_status" "enum_pages_blocks_faq_copy_status" DEFAULT 'approved',
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_faq" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"anchor" varchar,
  	"copy_status" "enum__pages_v_blocks_faq_copy_status" DEFAULT 'approved',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "faqs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"question" varchar,
  	"answer" varchar,
  	"page" varchar,
  	"order" numeric DEFAULT 1,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_faqs_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_faqs_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_question" varchar,
  	"version_answer" varchar,
  	"version_page" varchar,
  	"version_order" numeric DEFAULT 1,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__faqs_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "practitioners_credentials" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"credential" varchar NOT NULL
  );
  
  CREATE TABLE "practitioners" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"public_name" varchar NOT NULL,
  	"photo_id" integer,
  	"bio" varchar,
  	"staff_id" integer,
  	"active" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "practitioners_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"services_id" integer
  );
  
  CREATE TABLE "services_options" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"duration" numeric,
  	"price" numeric,
  	"gst_inclusive" boolean DEFAULT true
  );
  
  CREATE TABLE "services_booking_rules_refunds" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"hours_before" numeric NOT NULL,
  	"refund_percent" numeric NOT NULL
  );
  
  CREATE TABLE "services_facts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"statement" varchar NOT NULL,
  	"source" "enum_services_facts_source" NOT NULL,
  	"checked_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "services" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"type" "enum_services_type" NOT NULL,
  	"slug" varchar NOT NULL,
  	"register" "enum_services_register" NOT NULL,
  	"format" "enum_services_format" NOT NULL,
  	"sac_code" varchar,
  	"booking_rules_notice_hours" numeric,
  	"booking_rules_horizon_days" numeric,
  	"booking_rules_buffer_minutes" numeric,
  	"booking_rules_hold_minutes" numeric,
  	"booking_rules_reschedule_window_hours" numeric,
  	"active" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "faqs_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "practitioners_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "services_id" integer;
  ALTER TABLE "pages_blocks_faq" ADD CONSTRAINT "pages_blocks_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_faq" ADD CONSTRAINT "_pages_v_blocks_faq_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_faqs_v" ADD CONSTRAINT "_faqs_v_parent_id_faqs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."faqs"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "practitioners_credentials" ADD CONSTRAINT "practitioners_credentials_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."practitioners"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "practitioners" ADD CONSTRAINT "practitioners_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "practitioners" ADD CONSTRAINT "practitioners_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "practitioners_rels" ADD CONSTRAINT "practitioners_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."practitioners"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "practitioners_rels" ADD CONSTRAINT "practitioners_rels_services_fk" FOREIGN KEY ("services_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "services_options" ADD CONSTRAINT "services_options_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "services_booking_rules_refunds" ADD CONSTRAINT "services_booking_rules_refunds_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "services_facts" ADD CONSTRAINT "services_facts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_faq_order_idx" ON "pages_blocks_faq" USING btree ("_order");
  CREATE INDEX "pages_blocks_faq_parent_id_idx" ON "pages_blocks_faq" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_faq_path_idx" ON "pages_blocks_faq" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_faq_order_idx" ON "_pages_v_blocks_faq" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_faq_parent_id_idx" ON "_pages_v_blocks_faq" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_faq_path_idx" ON "_pages_v_blocks_faq" USING btree ("_path");
  CREATE INDEX "faqs_page_idx" ON "faqs" USING btree ("page");
  CREATE INDEX "faqs_updated_at_idx" ON "faqs" USING btree ("updated_at");
  CREATE INDEX "faqs_created_at_idx" ON "faqs" USING btree ("created_at");
  CREATE INDEX "faqs__status_idx" ON "faqs" USING btree ("_status");
  CREATE INDEX "_faqs_v_parent_idx" ON "_faqs_v" USING btree ("parent_id");
  CREATE INDEX "_faqs_v_version_version_page_idx" ON "_faqs_v" USING btree ("version_page");
  CREATE INDEX "_faqs_v_version_version_updated_at_idx" ON "_faqs_v" USING btree ("version_updated_at");
  CREATE INDEX "_faqs_v_version_version_created_at_idx" ON "_faqs_v" USING btree ("version_created_at");
  CREATE INDEX "_faqs_v_version_version__status_idx" ON "_faqs_v" USING btree ("version__status");
  CREATE INDEX "_faqs_v_created_at_idx" ON "_faqs_v" USING btree ("created_at");
  CREATE INDEX "_faqs_v_updated_at_idx" ON "_faqs_v" USING btree ("updated_at");
  CREATE INDEX "_faqs_v_latest_idx" ON "_faqs_v" USING btree ("latest");
  CREATE INDEX "practitioners_credentials_order_idx" ON "practitioners_credentials" USING btree ("_order");
  CREATE INDEX "practitioners_credentials_parent_id_idx" ON "practitioners_credentials" USING btree ("_parent_id");
  CREATE INDEX "practitioners_photo_idx" ON "practitioners" USING btree ("photo_id");
  CREATE UNIQUE INDEX "practitioners_staff_idx" ON "practitioners" USING btree ("staff_id");
  CREATE INDEX "practitioners_active_idx" ON "practitioners" USING btree ("active");
  CREATE INDEX "practitioners_updated_at_idx" ON "practitioners" USING btree ("updated_at");
  CREATE INDEX "practitioners_created_at_idx" ON "practitioners" USING btree ("created_at");
  CREATE INDEX "practitioners_rels_order_idx" ON "practitioners_rels" USING btree ("order");
  CREATE INDEX "practitioners_rels_parent_idx" ON "practitioners_rels" USING btree ("parent_id");
  CREATE INDEX "practitioners_rels_path_idx" ON "practitioners_rels" USING btree ("path");
  CREATE INDEX "practitioners_rels_services_id_idx" ON "practitioners_rels" USING btree ("services_id");
  CREATE INDEX "services_options_order_idx" ON "services_options" USING btree ("_order");
  CREATE INDEX "services_options_parent_id_idx" ON "services_options" USING btree ("_parent_id");
  CREATE INDEX "services_booking_rules_refunds_order_idx" ON "services_booking_rules_refunds" USING btree ("_order");
  CREATE INDEX "services_booking_rules_refunds_parent_id_idx" ON "services_booking_rules_refunds" USING btree ("_parent_id");
  CREATE INDEX "services_facts_order_idx" ON "services_facts" USING btree ("_order");
  CREATE INDEX "services_facts_parent_id_idx" ON "services_facts" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "services_slug_idx" ON "services" USING btree ("slug");
  CREATE INDEX "services_active_idx" ON "services" USING btree ("active");
  CREATE INDEX "services_updated_at_idx" ON "services" USING btree ("updated_at");
  CREATE INDEX "services_created_at_idx" ON "services" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_faqs_fk" FOREIGN KEY ("faqs_id") REFERENCES "public"."faqs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_practitioners_fk" FOREIGN KEY ("practitioners_id") REFERENCES "public"."practitioners"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_services_fk" FOREIGN KEY ("services_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_faqs_id_idx" ON "payload_locked_documents_rels" USING btree ("faqs_id");
  CREATE INDEX "payload_locked_documents_rels_practitioners_id_idx" ON "payload_locked_documents_rels" USING btree ("practitioners_id");
  CREATE INDEX "payload_locked_documents_rels_services_id_idx" ON "payload_locked_documents_rels" USING btree ("services_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_faq" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_faq" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "faqs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_faqs_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "practitioners_credentials" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "practitioners" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "practitioners_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "services_options" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "services_booking_rules_refunds" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "services_facts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "services" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "pages_blocks_faq" CASCADE;
  DROP TABLE "_pages_v_blocks_faq" CASCADE;
  DROP TABLE "faqs" CASCADE;
  DROP TABLE "_faqs_v" CASCADE;
  DROP TABLE "practitioners_credentials" CASCADE;
  DROP TABLE "practitioners" CASCADE;
  DROP TABLE "practitioners_rels" CASCADE;
  DROP TABLE "services_options" CASCADE;
  DROP TABLE "services_booking_rules_refunds" CASCADE;
  DROP TABLE "services_facts" CASCADE;
  DROP TABLE "services" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_faqs_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_practitioners_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_services_fk";
  
  DROP INDEX "payload_locked_documents_rels_faqs_id_idx";
  DROP INDEX "payload_locked_documents_rels_practitioners_id_idx";
  DROP INDEX "payload_locked_documents_rels_services_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "faqs_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "practitioners_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "services_id";
  DROP TYPE "public"."enum_pages_blocks_faq_copy_status";
  DROP TYPE "public"."enum__pages_v_blocks_faq_copy_status";
  DROP TYPE "public"."enum_faqs_status";
  DROP TYPE "public"."enum__faqs_v_version_status";
  DROP TYPE "public"."enum_services_facts_source";
  DROP TYPE "public"."enum_services_type";
  DROP TYPE "public"."enum_services_register";
  DROP TYPE "public"."enum_services_format";`)
}
