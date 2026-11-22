import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_testimonials_doors" AS ENUM('consultancy', 'education', 'counselling', 'framework');
  CREATE TYPE "public"."enum_testimonials_status" AS ENUM('received', 'screened', 'consentRequested', 'approved', 'published', 'declined', 'withdrawn');
  CREATE TYPE "public"."enum_testimonials_publishedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_testimonials_origin" AS ENUM('earlierProgramme', 'platformFeedback');
  CREATE TYPE "public"."enum_testimonials_display_form" AS ENUM('full', 'firstNameInitial', 'initials');
  CREATE TYPE "public"."enum_testimonials_connection" AS ENUM('none', 'friend', 'relative', 'worksWith', 'workedWith');
  CREATE TYPE "public"."enum_testimonials_language" AS ENUM('en-IN', 'gu-IN', 'hi-IN');
  CREATE TYPE "public"."enum_testimonials_source" AS ENUM('letter', 'email', 'whatsapp', 'feedbackForm', 'brochure', 'googleReview', 'linkedin', 'instagram', 'video', 'inPerson', 'other');
  CREATE TYPE "public"."enum_testimonials_receivedon_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_testimonials_screening_result" AS ENUM('notScreened', 'passes', 'needsInformation', 'notPublishable');
  CREATE TABLE "testimonials_doors" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_testimonials_doors",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "testimonials_placements" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"page" varchar NOT NULL,
  	"section" varchar NOT NULL
  );
  
  CREATE TABLE "testimonials" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"status" "enum_testimonials_status" DEFAULT 'received' NOT NULL,
  	"published_at" timestamp(3) with time zone,
  	"publishedat_tz" "enum_testimonials_publishedat_tz" DEFAULT 'Asia/Kolkata',
  	"approved_by_id" integer,
  	"intake_ref" varchar,
  	"origin" "enum_testimonials_origin" DEFAULT 'earlierProgramme' NOT NULL,
  	"person_id" integer,
  	"display_form" "enum_testimonials_display_form" NOT NULL,
  	"shown_name" varchar,
  	"designation" varchar,
  	"place" varchar,
  	"organisation" varchar,
  	"show_organisation" boolean DEFAULT false,
  	"connection" "enum_testimonials_connection",
  	"incentive" varchar,
  	"programme" varchar,
  	"service_id" integer,
  	"year" numeric,
  	"month" numeric,
  	"text" varchar,
  	"language" "enum_testimonials_language" DEFAULT 'en-IN' NOT NULL,
  	"translation" varchar,
  	"translator" varchar,
  	"translation_approved" boolean DEFAULT false,
  	"excerpt" varchar,
  	"excerpt_approved" boolean DEFAULT false,
  	"photo_id" integer,
  	"photo_agreed" boolean DEFAULT false,
  	"profile_link" varchar,
  	"profile_link_agreed" boolean DEFAULT false,
  	"source" "enum_testimonials_source",
  	"received_on" timestamp(3) with time zone,
  	"receivedon_tz" "enum_testimonials_receivedon_tz" DEFAULT 'Asia/Kolkata',
  	"original_reference" varchar,
  	"screening_result" "enum_testimonials_screening_result" DEFAULT 'notScreened',
  	"screening_tests_original" boolean DEFAULT false,
  	"screening_tests_programme_and_year" boolean DEFAULT false,
  	"screening_tests_own_experience" boolean DEFAULT false,
  	"screening_tests_no_clinical_claim" boolean DEFAULT false,
  	"screening_tests_no_other_person" boolean DEFAULT false,
  	"screening_tests_adult_consents" boolean DEFAULT false,
  	"screening_tests_not_ankvishwa" boolean DEFAULT false,
  	"screening_tests_excerpt_keeps_meaning" boolean DEFAULT false,
  	"screening_reason" varchar,
  	"consent_id" integer,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "testimonials_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "testimonials_id" integer;
  ALTER TABLE "testimonials_doors" ADD CONSTRAINT "testimonials_doors_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "testimonials_placements" ADD CONSTRAINT "testimonials_placements_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."testimonials"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_consent_id_consents_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."consents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "testimonials_texts" ADD CONSTRAINT "testimonials_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."testimonials"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "testimonials_doors_order_idx" ON "testimonials_doors" USING btree ("order");
  CREATE INDEX "testimonials_doors_parent_idx" ON "testimonials_doors" USING btree ("parent_id");
  CREATE INDEX "testimonials_placements_order_idx" ON "testimonials_placements" USING btree ("_order");
  CREATE INDEX "testimonials_placements_parent_id_idx" ON "testimonials_placements" USING btree ("_parent_id");
  CREATE INDEX "testimonials_status_idx" ON "testimonials" USING btree ("status");
  CREATE INDEX "testimonials_approved_by_idx" ON "testimonials" USING btree ("approved_by_id");
  CREATE UNIQUE INDEX "testimonials_intake_ref_idx" ON "testimonials" USING btree ("intake_ref");
  CREATE INDEX "testimonials_person_idx" ON "testimonials" USING btree ("person_id");
  CREATE INDEX "testimonials_service_idx" ON "testimonials" USING btree ("service_id");
  CREATE INDEX "testimonials_photo_idx" ON "testimonials" USING btree ("photo_id");
  CREATE INDEX "testimonials_consent_idx" ON "testimonials" USING btree ("consent_id");
  CREATE INDEX "testimonials_updated_at_idx" ON "testimonials" USING btree ("updated_at");
  CREATE INDEX "testimonials_created_at_idx" ON "testimonials" USING btree ("created_at");
  CREATE INDEX "testimonials_texts_order_parent" ON "testimonials_texts" USING btree ("order","parent_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_testimonials_fk" FOREIGN KEY ("testimonials_id") REFERENCES "public"."testimonials"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_testimonials_id_idx" ON "payload_locked_documents_rels" USING btree ("testimonials_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "testimonials_doors" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "testimonials_placements" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "testimonials" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "testimonials_texts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "testimonials_doors" CASCADE;
  DROP TABLE "testimonials_placements" CASCADE;
  DROP TABLE "testimonials" CASCADE;
  DROP TABLE "testimonials_texts" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_testimonials_fk";
  
  DROP INDEX "payload_locked_documents_rels_testimonials_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "testimonials_id";
  DROP TYPE "public"."enum_testimonials_doors";
  DROP TYPE "public"."enum_testimonials_status";
  DROP TYPE "public"."enum_testimonials_publishedat_tz";
  DROP TYPE "public"."enum_testimonials_origin";
  DROP TYPE "public"."enum_testimonials_display_form";
  DROP TYPE "public"."enum_testimonials_connection";
  DROP TYPE "public"."enum_testimonials_language";
  DROP TYPE "public"."enum_testimonials_source";
  DROP TYPE "public"."enum_testimonials_receivedon_tz";
  DROP TYPE "public"."enum_testimonials_screening_result";`)
}
