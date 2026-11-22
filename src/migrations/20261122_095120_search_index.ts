import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "search_index" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"priority" numeric,
  	"url" varchar,
  	"excerpt" varchar,
  	"content" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "search_index_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"pages_id" integer,
  	"services_id" integer,
  	"posts_id" integer,
  	"faqs_id" integer
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "search_index_id" integer;
  ALTER TABLE "search_index_rels" ADD CONSTRAINT "search_index_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."search_index"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "search_index_rels" ADD CONSTRAINT "search_index_rels_pages_fk" FOREIGN KEY ("pages_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "search_index_rels" ADD CONSTRAINT "search_index_rels_services_fk" FOREIGN KEY ("services_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "search_index_rels" ADD CONSTRAINT "search_index_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "search_index_rels" ADD CONSTRAINT "search_index_rels_faqs_fk" FOREIGN KEY ("faqs_id") REFERENCES "public"."faqs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "search_index_updated_at_idx" ON "search_index" USING btree ("updated_at");
  CREATE INDEX "search_index_created_at_idx" ON "search_index" USING btree ("created_at");
  CREATE INDEX "search_index_rels_order_idx" ON "search_index_rels" USING btree ("order");
  CREATE INDEX "search_index_rels_parent_idx" ON "search_index_rels" USING btree ("parent_id");
  CREATE INDEX "search_index_rels_path_idx" ON "search_index_rels" USING btree ("path");
  CREATE INDEX "search_index_rels_pages_id_idx" ON "search_index_rels" USING btree ("pages_id");
  CREATE INDEX "search_index_rels_services_id_idx" ON "search_index_rels" USING btree ("services_id");
  CREATE INDEX "search_index_rels_posts_id_idx" ON "search_index_rels" USING btree ("posts_id");
  CREATE INDEX "search_index_rels_faqs_id_idx" ON "search_index_rels" USING btree ("faqs_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_search_index_fk" FOREIGN KEY ("search_index_id") REFERENCES "public"."search_index"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_search_index_id_idx" ON "payload_locked_documents_rels" USING btree ("search_index_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "search_index" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "search_index_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "search_index" CASCADE;
  DROP TABLE "search_index_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_search_index_fk";
  
  DROP INDEX "payload_locked_documents_rels_search_index_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "search_index_id";`)
}
