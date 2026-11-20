import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_pages_blocks_comparison_copy_status" AS ENUM('approved', 'candidate');
  CREATE TYPE "public"."enum_pages_blocks_points_copy_status" AS ENUM('approved', 'candidate');
  CREATE TYPE "public"."enum__pages_v_blocks_comparison_copy_status" AS ENUM('approved', 'candidate');
  CREATE TYPE "public"."enum__pages_v_blocks_points_copy_status" AS ENUM('approved', 'candidate');
  CREATE TABLE "pages_blocks_comparison_pairs" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"left" varchar,
  	"right" varchar
  );
  
  CREATE TABLE "pages_blocks_comparison" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"left_label" varchar,
  	"right_label" varchar,
  	"copy_status" "enum_pages_blocks_comparison_copy_status" DEFAULT 'approved',
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_points_points" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "pages_blocks_points" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"lead" varchar,
  	"copy_status" "enum_pages_blocks_points_copy_status" DEFAULT 'approved',
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_comparison_pairs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"left" varchar,
  	"right" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_comparison" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"left_label" varchar,
  	"right_label" varchar,
  	"copy_status" "enum__pages_v_blocks_comparison_copy_status" DEFAULT 'approved',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_points_points" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"text" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_points" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"kicker" varchar,
  	"heading" varchar,
  	"lead" varchar,
  	"copy_status" "enum__pages_v_blocks_points_copy_status" DEFAULT 'approved',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  ALTER TABLE "pages_blocks_doors" ADD COLUMN "intro" varchar;
  ALTER TABLE "_pages_v_blocks_doors" ADD COLUMN "intro" varchar;
  ALTER TABLE "pages_blocks_comparison_pairs" ADD CONSTRAINT "pages_blocks_comparison_pairs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_comparison"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_comparison" ADD CONSTRAINT "pages_blocks_comparison_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_points_points" ADD CONSTRAINT "pages_blocks_points_points_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_points"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_points" ADD CONSTRAINT "pages_blocks_points_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_comparison_pairs" ADD CONSTRAINT "_pages_v_blocks_comparison_pairs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_comparison"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_comparison" ADD CONSTRAINT "_pages_v_blocks_comparison_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_points_points" ADD CONSTRAINT "_pages_v_blocks_points_points_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_points"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_points" ADD CONSTRAINT "_pages_v_blocks_points_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_comparison_pairs_order_idx" ON "pages_blocks_comparison_pairs" USING btree ("_order");
  CREATE INDEX "pages_blocks_comparison_pairs_parent_id_idx" ON "pages_blocks_comparison_pairs" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_comparison_order_idx" ON "pages_blocks_comparison" USING btree ("_order");
  CREATE INDEX "pages_blocks_comparison_parent_id_idx" ON "pages_blocks_comparison" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_comparison_path_idx" ON "pages_blocks_comparison" USING btree ("_path");
  CREATE INDEX "pages_blocks_points_points_order_idx" ON "pages_blocks_points_points" USING btree ("_order");
  CREATE INDEX "pages_blocks_points_points_parent_id_idx" ON "pages_blocks_points_points" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_points_order_idx" ON "pages_blocks_points" USING btree ("_order");
  CREATE INDEX "pages_blocks_points_parent_id_idx" ON "pages_blocks_points" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_points_path_idx" ON "pages_blocks_points" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_comparison_pairs_order_idx" ON "_pages_v_blocks_comparison_pairs" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_comparison_pairs_parent_id_idx" ON "_pages_v_blocks_comparison_pairs" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_comparison_order_idx" ON "_pages_v_blocks_comparison" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_comparison_parent_id_idx" ON "_pages_v_blocks_comparison" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_comparison_path_idx" ON "_pages_v_blocks_comparison" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_points_points_order_idx" ON "_pages_v_blocks_points_points" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_points_points_parent_id_idx" ON "_pages_v_blocks_points_points" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_points_order_idx" ON "_pages_v_blocks_points" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_points_parent_id_idx" ON "_pages_v_blocks_points" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_points_path_idx" ON "_pages_v_blocks_points" USING btree ("_path");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "pages_blocks_comparison_pairs" CASCADE;
  DROP TABLE "pages_blocks_comparison" CASCADE;
  DROP TABLE "pages_blocks_points_points" CASCADE;
  DROP TABLE "pages_blocks_points" CASCADE;
  DROP TABLE "_pages_v_blocks_comparison_pairs" CASCADE;
  DROP TABLE "_pages_v_blocks_comparison" CASCADE;
  DROP TABLE "_pages_v_blocks_points_points" CASCADE;
  DROP TABLE "_pages_v_blocks_points" CASCADE;
  ALTER TABLE "pages_blocks_doors" DROP COLUMN "intro";
  ALTER TABLE "_pages_v_blocks_doors" DROP COLUMN "intro";
  DROP TYPE "public"."enum_pages_blocks_comparison_copy_status";
  DROP TYPE "public"."enum_pages_blocks_points_copy_status";
  DROP TYPE "public"."enum__pages_v_blocks_comparison_copy_status";
  DROP TYPE "public"."enum__pages_v_blocks_points_copy_status";`)
}
