import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_pages_blocks_hero_copy_status" AS ENUM('approved', 'candidate');
  CREATE TYPE "public"."enum_pages_blocks_doors_copy_status" AS ENUM('approved', 'candidate');
  CREATE TYPE "public"."enum_pages_blocks_statement_copy_status" AS ENUM('approved', 'candidate');
  CREATE TYPE "public"."enum_pages_blocks_steps_copy_status" AS ENUM('approved', 'candidate');
  CREATE TYPE "public"."enum_pages_blocks_fact_list_copy_status" AS ENUM('approved', 'candidate');
  CREATE TYPE "public"."enum_pages_blocks_founder_note_copy_status" AS ENUM('approved', 'candidate');
  CREATE TYPE "public"."enum_pages_blocks_band_copy_status" AS ENUM('approved', 'candidate');
  CREATE TYPE "public"."enum_pages_facts_source" AS ENUM('brochure', 'site', 'founder', 'description', 'counted');
  CREATE TYPE "public"."enum_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__pages_v_blocks_hero_copy_status" AS ENUM('approved', 'candidate');
  CREATE TYPE "public"."enum__pages_v_blocks_doors_copy_status" AS ENUM('approved', 'candidate');
  CREATE TYPE "public"."enum__pages_v_blocks_statement_copy_status" AS ENUM('approved', 'candidate');
  CREATE TYPE "public"."enum__pages_v_blocks_steps_copy_status" AS ENUM('approved', 'candidate');
  CREATE TYPE "public"."enum__pages_v_blocks_fact_list_copy_status" AS ENUM('approved', 'candidate');
  CREATE TYPE "public"."enum__pages_v_blocks_founder_note_copy_status" AS ENUM('approved', 'candidate');
  CREATE TYPE "public"."enum__pages_v_blocks_band_copy_status" AS ENUM('approved', 'candidate');
  CREATE TYPE "public"."enum__pages_v_version_facts_source" AS ENUM('brochure', 'site', 'founder', 'description', 'counted');
  CREATE TYPE "public"."enum__pages_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "pages_blocks_hero" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"lead" varchar,
  	"primary_label" varchar,
  	"primary_href" varchar,
  	"secondary_label" varchar,
  	"secondary_href" varchar,
  	"copy_status" "enum_pages_blocks_hero_copy_status" DEFAULT 'approved',
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_doors_doors" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"glyph" varchar,
  	"audience" varchar,
  	"href" varchar,
  	"question" varchar,
  	"line" varchar,
  	"outcomes" varchar,
  	"action" varchar
  );
  
  CREATE TABLE "pages_blocks_doors" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"copy_status" "enum_pages_blocks_doors_copy_status" DEFAULT 'approved',
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_statement_paragraphs" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "pages_blocks_statement" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"action_label" varchar,
  	"action_href" varchar,
  	"copy_status" "enum_pages_blocks_statement_copy_status" DEFAULT 'approved',
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_steps_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"text" varchar
  );
  
  CREATE TABLE "pages_blocks_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"copy_status" "enum_pages_blocks_steps_copy_status" DEFAULT 'approved',
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_fact_list_facts" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"statement" varchar,
  	"source" varchar
  );
  
  CREATE TABLE "pages_blocks_fact_list" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"copy_status" "enum_pages_blocks_fact_list_copy_status" DEFAULT 'approved',
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_founder_note" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"note" varchar,
  	"attribution" varchar,
  	"copy_status" "enum_pages_blocks_founder_note_copy_status" DEFAULT 'approved',
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_band" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"lead" varchar,
  	"sanskrit" varchar,
  	"translation" varchar,
  	"primary_label" varchar,
  	"primary_href" varchar,
  	"copy_status" "enum_pages_blocks_band_copy_status" DEFAULT 'approved',
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_facts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"statement" varchar,
  	"source" "enum_pages_facts_source",
  	"checked_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"slug" varchar,
  	"description" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_pages_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_pages_v_blocks_hero" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"lead" varchar,
  	"primary_label" varchar,
  	"primary_href" varchar,
  	"secondary_label" varchar,
  	"secondary_href" varchar,
  	"copy_status" "enum__pages_v_blocks_hero_copy_status" DEFAULT 'approved',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_doors_doors" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"glyph" varchar,
  	"audience" varchar,
  	"href" varchar,
  	"question" varchar,
  	"line" varchar,
  	"outcomes" varchar,
  	"action" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_doors" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"copy_status" "enum__pages_v_blocks_doors_copy_status" DEFAULT 'approved',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_statement_paragraphs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"text" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_statement" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"action_label" varchar,
  	"action_href" varchar,
  	"copy_status" "enum__pages_v_blocks_statement_copy_status" DEFAULT 'approved',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_steps_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"text" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"copy_status" "enum__pages_v_blocks_steps_copy_status" DEFAULT 'approved',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_fact_list_facts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"statement" varchar,
  	"source" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_fact_list" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"copy_status" "enum__pages_v_blocks_fact_list_copy_status" DEFAULT 'approved',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_founder_note" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"note" varchar,
  	"attribution" varchar,
  	"copy_status" "enum__pages_v_blocks_founder_note_copy_status" DEFAULT 'approved',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_band" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"lead" varchar,
  	"sanskrit" varchar,
  	"translation" varchar,
  	"primary_label" varchar,
  	"primary_href" varchar,
  	"copy_status" "enum__pages_v_blocks_band_copy_status" DEFAULT 'approved',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_version_facts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"statement" varchar,
  	"source" "enum__pages_v_version_facts_source",
  	"checked_at" timestamp(3) with time zone,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_slug" varchar,
  	"version_description" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__pages_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "pages_id" integer;
  ALTER TABLE "pages_blocks_hero" ADD CONSTRAINT "pages_blocks_hero_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_doors_doors" ADD CONSTRAINT "pages_blocks_doors_doors_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_doors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_doors" ADD CONSTRAINT "pages_blocks_doors_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_statement_paragraphs" ADD CONSTRAINT "pages_blocks_statement_paragraphs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_statement"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_statement" ADD CONSTRAINT "pages_blocks_statement_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_steps_steps" ADD CONSTRAINT "pages_blocks_steps_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_steps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_steps" ADD CONSTRAINT "pages_blocks_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_fact_list_facts" ADD CONSTRAINT "pages_blocks_fact_list_facts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_fact_list"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_fact_list" ADD CONSTRAINT "pages_blocks_fact_list_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_founder_note" ADD CONSTRAINT "pages_blocks_founder_note_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_band" ADD CONSTRAINT "pages_blocks_band_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_facts" ADD CONSTRAINT "pages_facts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_hero" ADD CONSTRAINT "_pages_v_blocks_hero_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_doors_doors" ADD CONSTRAINT "_pages_v_blocks_doors_doors_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_doors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_doors" ADD CONSTRAINT "_pages_v_blocks_doors_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_statement_paragraphs" ADD CONSTRAINT "_pages_v_blocks_statement_paragraphs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_statement"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_statement" ADD CONSTRAINT "_pages_v_blocks_statement_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_steps_steps" ADD CONSTRAINT "_pages_v_blocks_steps_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_steps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_steps" ADD CONSTRAINT "_pages_v_blocks_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_fact_list_facts" ADD CONSTRAINT "_pages_v_blocks_fact_list_facts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_fact_list"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_fact_list" ADD CONSTRAINT "_pages_v_blocks_fact_list_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_founder_note" ADD CONSTRAINT "_pages_v_blocks_founder_note_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_band" ADD CONSTRAINT "_pages_v_blocks_band_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_version_facts" ADD CONSTRAINT "_pages_v_version_facts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "pages_blocks_hero_order_idx" ON "pages_blocks_hero" USING btree ("_order");
  CREATE INDEX "pages_blocks_hero_parent_id_idx" ON "pages_blocks_hero" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_hero_path_idx" ON "pages_blocks_hero" USING btree ("_path");
  CREATE INDEX "pages_blocks_doors_doors_order_idx" ON "pages_blocks_doors_doors" USING btree ("_order");
  CREATE INDEX "pages_blocks_doors_doors_parent_id_idx" ON "pages_blocks_doors_doors" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_doors_order_idx" ON "pages_blocks_doors" USING btree ("_order");
  CREATE INDEX "pages_blocks_doors_parent_id_idx" ON "pages_blocks_doors" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_doors_path_idx" ON "pages_blocks_doors" USING btree ("_path");
  CREATE INDEX "pages_blocks_statement_paragraphs_order_idx" ON "pages_blocks_statement_paragraphs" USING btree ("_order");
  CREATE INDEX "pages_blocks_statement_paragraphs_parent_id_idx" ON "pages_blocks_statement_paragraphs" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_statement_order_idx" ON "pages_blocks_statement" USING btree ("_order");
  CREATE INDEX "pages_blocks_statement_parent_id_idx" ON "pages_blocks_statement" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_statement_path_idx" ON "pages_blocks_statement" USING btree ("_path");
  CREATE INDEX "pages_blocks_steps_steps_order_idx" ON "pages_blocks_steps_steps" USING btree ("_order");
  CREATE INDEX "pages_blocks_steps_steps_parent_id_idx" ON "pages_blocks_steps_steps" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_steps_order_idx" ON "pages_blocks_steps" USING btree ("_order");
  CREATE INDEX "pages_blocks_steps_parent_id_idx" ON "pages_blocks_steps" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_steps_path_idx" ON "pages_blocks_steps" USING btree ("_path");
  CREATE INDEX "pages_blocks_fact_list_facts_order_idx" ON "pages_blocks_fact_list_facts" USING btree ("_order");
  CREATE INDEX "pages_blocks_fact_list_facts_parent_id_idx" ON "pages_blocks_fact_list_facts" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_fact_list_order_idx" ON "pages_blocks_fact_list" USING btree ("_order");
  CREATE INDEX "pages_blocks_fact_list_parent_id_idx" ON "pages_blocks_fact_list" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_fact_list_path_idx" ON "pages_blocks_fact_list" USING btree ("_path");
  CREATE INDEX "pages_blocks_founder_note_order_idx" ON "pages_blocks_founder_note" USING btree ("_order");
  CREATE INDEX "pages_blocks_founder_note_parent_id_idx" ON "pages_blocks_founder_note" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_founder_note_path_idx" ON "pages_blocks_founder_note" USING btree ("_path");
  CREATE INDEX "pages_blocks_band_order_idx" ON "pages_blocks_band" USING btree ("_order");
  CREATE INDEX "pages_blocks_band_parent_id_idx" ON "pages_blocks_band" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_band_path_idx" ON "pages_blocks_band" USING btree ("_path");
  CREATE INDEX "pages_facts_order_idx" ON "pages_facts" USING btree ("_order");
  CREATE INDEX "pages_facts_parent_id_idx" ON "pages_facts" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "pages_slug_idx" ON "pages" USING btree ("slug");
  CREATE INDEX "pages_updated_at_idx" ON "pages" USING btree ("updated_at");
  CREATE INDEX "pages_created_at_idx" ON "pages" USING btree ("created_at");
  CREATE INDEX "pages__status_idx" ON "pages" USING btree ("_status");
  CREATE INDEX "_pages_v_blocks_hero_order_idx" ON "_pages_v_blocks_hero" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_hero_parent_id_idx" ON "_pages_v_blocks_hero" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_hero_path_idx" ON "_pages_v_blocks_hero" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_doors_doors_order_idx" ON "_pages_v_blocks_doors_doors" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_doors_doors_parent_id_idx" ON "_pages_v_blocks_doors_doors" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_doors_order_idx" ON "_pages_v_blocks_doors" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_doors_parent_id_idx" ON "_pages_v_blocks_doors" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_doors_path_idx" ON "_pages_v_blocks_doors" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_statement_paragraphs_order_idx" ON "_pages_v_blocks_statement_paragraphs" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_statement_paragraphs_parent_id_idx" ON "_pages_v_blocks_statement_paragraphs" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_statement_order_idx" ON "_pages_v_blocks_statement" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_statement_parent_id_idx" ON "_pages_v_blocks_statement" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_statement_path_idx" ON "_pages_v_blocks_statement" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_steps_steps_order_idx" ON "_pages_v_blocks_steps_steps" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_steps_steps_parent_id_idx" ON "_pages_v_blocks_steps_steps" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_steps_order_idx" ON "_pages_v_blocks_steps" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_steps_parent_id_idx" ON "_pages_v_blocks_steps" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_steps_path_idx" ON "_pages_v_blocks_steps" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_fact_list_facts_order_idx" ON "_pages_v_blocks_fact_list_facts" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_fact_list_facts_parent_id_idx" ON "_pages_v_blocks_fact_list_facts" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_fact_list_order_idx" ON "_pages_v_blocks_fact_list" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_fact_list_parent_id_idx" ON "_pages_v_blocks_fact_list" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_fact_list_path_idx" ON "_pages_v_blocks_fact_list" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_founder_note_order_idx" ON "_pages_v_blocks_founder_note" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_founder_note_parent_id_idx" ON "_pages_v_blocks_founder_note" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_founder_note_path_idx" ON "_pages_v_blocks_founder_note" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_band_order_idx" ON "_pages_v_blocks_band" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_band_parent_id_idx" ON "_pages_v_blocks_band" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_band_path_idx" ON "_pages_v_blocks_band" USING btree ("_path");
  CREATE INDEX "_pages_v_version_facts_order_idx" ON "_pages_v_version_facts" USING btree ("_order");
  CREATE INDEX "_pages_v_version_facts_parent_id_idx" ON "_pages_v_version_facts" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_parent_idx" ON "_pages_v" USING btree ("parent_id");
  CREATE INDEX "_pages_v_version_version_slug_idx" ON "_pages_v" USING btree ("version_slug");
  CREATE INDEX "_pages_v_version_version_updated_at_idx" ON "_pages_v" USING btree ("version_updated_at");
  CREATE INDEX "_pages_v_version_version_created_at_idx" ON "_pages_v" USING btree ("version_created_at");
  CREATE INDEX "_pages_v_version_version__status_idx" ON "_pages_v" USING btree ("version__status");
  CREATE INDEX "_pages_v_created_at_idx" ON "_pages_v" USING btree ("created_at");
  CREATE INDEX "_pages_v_updated_at_idx" ON "_pages_v" USING btree ("updated_at");
  CREATE INDEX "_pages_v_latest_idx" ON "_pages_v" USING btree ("latest");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_pages_id_idx" ON "payload_locked_documents_rels" USING btree ("pages_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_hero" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_doors_doors" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_doors" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_statement_paragraphs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_statement" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_steps_steps" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_steps" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_fact_list_facts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_fact_list" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_founder_note" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_band" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_facts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_hero" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_doors_doors" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_doors" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_statement_paragraphs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_statement" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_steps_steps" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_steps" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_fact_list_facts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_fact_list" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_founder_note" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_band" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_version_facts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "pages_blocks_hero" CASCADE;
  DROP TABLE "pages_blocks_doors_doors" CASCADE;
  DROP TABLE "pages_blocks_doors" CASCADE;
  DROP TABLE "pages_blocks_statement_paragraphs" CASCADE;
  DROP TABLE "pages_blocks_statement" CASCADE;
  DROP TABLE "pages_blocks_steps_steps" CASCADE;
  DROP TABLE "pages_blocks_steps" CASCADE;
  DROP TABLE "pages_blocks_fact_list_facts" CASCADE;
  DROP TABLE "pages_blocks_fact_list" CASCADE;
  DROP TABLE "pages_blocks_founder_note" CASCADE;
  DROP TABLE "pages_blocks_band" CASCADE;
  DROP TABLE "pages_facts" CASCADE;
  DROP TABLE "pages" CASCADE;
  DROP TABLE "_pages_v_blocks_hero" CASCADE;
  DROP TABLE "_pages_v_blocks_doors_doors" CASCADE;
  DROP TABLE "_pages_v_blocks_doors" CASCADE;
  DROP TABLE "_pages_v_blocks_statement_paragraphs" CASCADE;
  DROP TABLE "_pages_v_blocks_statement" CASCADE;
  DROP TABLE "_pages_v_blocks_steps_steps" CASCADE;
  DROP TABLE "_pages_v_blocks_steps" CASCADE;
  DROP TABLE "_pages_v_blocks_fact_list_facts" CASCADE;
  DROP TABLE "_pages_v_blocks_fact_list" CASCADE;
  DROP TABLE "_pages_v_blocks_founder_note" CASCADE;
  DROP TABLE "_pages_v_blocks_band" CASCADE;
  DROP TABLE "_pages_v_version_facts" CASCADE;
  DROP TABLE "_pages_v" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_pages_fk";
  
  DROP INDEX "payload_locked_documents_rels_pages_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "pages_id";
  DROP TYPE "public"."enum_pages_blocks_hero_copy_status";
  DROP TYPE "public"."enum_pages_blocks_doors_copy_status";
  DROP TYPE "public"."enum_pages_blocks_statement_copy_status";
  DROP TYPE "public"."enum_pages_blocks_steps_copy_status";
  DROP TYPE "public"."enum_pages_blocks_fact_list_copy_status";
  DROP TYPE "public"."enum_pages_blocks_founder_note_copy_status";
  DROP TYPE "public"."enum_pages_blocks_band_copy_status";
  DROP TYPE "public"."enum_pages_facts_source";
  DROP TYPE "public"."enum_pages_status";
  DROP TYPE "public"."enum__pages_v_blocks_hero_copy_status";
  DROP TYPE "public"."enum__pages_v_blocks_doors_copy_status";
  DROP TYPE "public"."enum__pages_v_blocks_statement_copy_status";
  DROP TYPE "public"."enum__pages_v_blocks_steps_copy_status";
  DROP TYPE "public"."enum__pages_v_blocks_fact_list_copy_status";
  DROP TYPE "public"."enum__pages_v_blocks_founder_note_copy_status";
  DROP TYPE "public"."enum__pages_v_blocks_band_copy_status";
  DROP TYPE "public"."enum__pages_v_version_facts_source";
  DROP TYPE "public"."enum__pages_v_version_status";`)
}
