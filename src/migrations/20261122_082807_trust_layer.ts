import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_people_mobileverifiedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_people_emailverifiedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_people_preferred_channel" AS ENUM('email', 'whatsapp');
  CREATE TYPE "public"."enum_people_language" AS ENUM('en-IN', 'gu-IN', 'hi-IN');
  CREATE TYPE "public"."enum_people_age_band" AS ENUM('under18', 'adult');
  CREATE TYPE "public"."enum_consents_purpose" AS ENUM('bookingCommunications', 'marketingEmail', 'marketingWhatsapp', 'mapStorage', 'mapSharing', 'testimonialPublication', 'relatedProgrammes');
  CREATE TYPE "public"."enum_consents_language" AS ENUM('en-IN', 'gu-IN', 'hi-IN');
  CREATE TYPE "public"."enum_consents_grantedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_consents_withdrawnat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_consents_channel" AS ENUM('web', 'email', 'whatsapp', 'phone', 'inPerson', 'recordDeleted');
  CREATE TYPE "public"."enum_consent_versions_purpose" AS ENUM('bookingCommunications', 'marketingEmail', 'marketingWhatsapp', 'mapStorage', 'mapSharing', 'testimonialPublication', 'relatedProgrammes');
  CREATE TYPE "public"."enum_consent_versions_language" AS ENUM('en-IN', 'gu-IN', 'hi-IN');
  CREATE TYPE "public"."enum_consent_versions_effectivefrom_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_analytics_events_name" AS ENUM('door', 'step0', 'booking_started', 'time_chosen', 'booking_confirmed', 'request_submitted', 'map_completed', 'newsletter_confirmed', 'search_no_results');
  CREATE TYPE "public"."enum_analytics_events_register" AS ENUM('default', 'consultancy', 'education', 'counselling');
  CREATE TYPE "public"."enum_analytics_events_who_for" AS ENUM('yourself', 'family', 'organisation');
  CREATE TYPE "public"."enum_analytics_events_at_tz" AS ENUM('Asia/Kolkata');
  CREATE TABLE "pages_blocks_legal" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_legal" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "people" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"full_name" varchar NOT NULL,
  	"mobile" varchar,
  	"email" varchar,
  	"mobile_verified_at" timestamp(3) with time zone,
  	"mobileverifiedat_tz" "enum_people_mobileverifiedat_tz" DEFAULT 'Asia/Kolkata',
  	"email_verified_at" timestamp(3) with time zone,
  	"emailverifiedat_tz" "enum_people_emailverifiedat_tz" DEFAULT 'Asia/Kolkata',
  	"preferred_channel" "enum_people_preferred_channel",
  	"language" "enum_people_language" DEFAULT 'en-IN' NOT NULL,
  	"age_band" "enum_people_age_band",
  	"city" varchar,
  	"source" varchar,
  	"utm_source" varchar,
  	"utm_medium" varchar,
  	"utm_campaign" varchar,
  	"utm_term" varchar,
  	"utm_content" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "people_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "consents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"withdraws_id" integer,
  	"person_id" integer,
  	"notice_version_id" integer NOT NULL,
  	"purpose" "enum_consents_purpose" NOT NULL,
  	"language" "enum_consents_language" NOT NULL,
  	"granted_at" timestamp(3) with time zone NOT NULL,
  	"grantedat_tz" "enum_consents_grantedat_tz" DEFAULT 'Asia/Kolkata' NOT NULL,
  	"withdrawn_at" timestamp(3) with time zone,
  	"withdrawnat_tz" "enum_consents_withdrawnat_tz" DEFAULT 'Asia/Kolkata',
  	"channel" "enum_consents_channel" NOT NULL,
  	"evidence_form" varchar,
  	"evidence_reference" varchar,
  	"evidence_ip" varchar,
  	"evidence_user_agent" varchar,
  	"written_receipt" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "consent_versions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"purpose" "enum_consent_versions_purpose" NOT NULL,
  	"language" "enum_consent_versions_language" DEFAULT 'en-IN' NOT NULL,
  	"version" numeric NOT NULL,
  	"text" varchar NOT NULL,
  	"effective_from" timestamp(3) with time zone NOT NULL,
  	"effectivefrom_tz" "enum_consent_versions_effectivefrom_tz" DEFAULT 'Asia/Kolkata' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "analytics_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" "enum_analytics_events_name" NOT NULL,
  	"route" varchar NOT NULL,
  	"register" "enum_analytics_events_register" NOT NULL,
  	"who_for" "enum_analytics_events_who_for",
  	"session_hash" varchar NOT NULL,
  	"at" timestamp(3) with time zone NOT NULL,
  	"at_tz" "enum_analytics_events_at_tz" DEFAULT 'Asia/Kolkata' NOT NULL
  );
  
  CREATE TABLE "settings_processors" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"location" varchar,
  	"contract" varchar,
  	"holds" varchar,
  	"reviewed_on" timestamp(3) with time zone
  );
  
  CREATE TABLE "settings_dark_pattern_audits" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"audited_on" timestamp(3) with time zone NOT NULL,
  	"audited_by" varchar NOT NULL,
  	"notes" varchar,
  	"certificate_id" integer
  );
  
  CREATE TABLE "settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"legal_legal_name" varchar,
  	"legal_trade_name" varchar,
  	"legal_address" varchar,
  	"legal_gstin" varchar,
  	"legal_gst_status" varchar,
  	"legal_udyam" varchar,
  	"legal_customer_care_email" varchar,
  	"legal_customer_care_phone" varchar,
  	"legal_customer_care_hours" varchar,
  	"legal_grievance_officer_name" varchar,
  	"legal_grievance_officer_designation" varchar,
  	"legal_grievance_officer_email" varchar,
  	"legal_grievance_officer_phone" varchar,
  	"legal_cert_in_name" varchar,
  	"legal_cert_in_email" varchar,
  	"legal_cert_in_phone" varchar,
  	"bank_account_name" varchar,
  	"bank_bank_name" varchar,
  	"bank_branch" varchar,
  	"bank_account_number" varchar,
  	"bank_ifsc" varchar,
  	"booking_notice_hours" numeric DEFAULT 12,
  	"booking_horizon_days" numeric DEFAULT 14,
  	"booking_hold_minutes" numeric DEFAULT 10,
  	"booking_buffer_minutes" numeric,
  	"booking_reschedule_window_hours" numeric,
  	"quiet_hours_start" varchar DEFAULT '21:00' NOT NULL,
  	"quiet_hours_end" varchar DEFAULT '08:00' NOT NULL,
  	"flags_prices_public" boolean DEFAULT false,
  	"flags_pay_at_booking" boolean DEFAULT false,
  	"flags_map_enabled" boolean DEFAULT false,
  	"flags_accounts_enabled" boolean DEFAULT false,
  	"flags_bridges_enabled" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "people_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "consents_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "consent_versions_id" integer;
  ALTER TABLE "pages_blocks_legal" ADD CONSTRAINT "pages_blocks_legal_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_legal" ADD CONSTRAINT "_pages_v_blocks_legal_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "people_texts" ADD CONSTRAINT "people_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "consents" ADD CONSTRAINT "consents_withdraws_id_consents_id_fk" FOREIGN KEY ("withdraws_id") REFERENCES "public"."consents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "consents" ADD CONSTRAINT "consents_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "consents" ADD CONSTRAINT "consents_notice_version_id_consent_versions_id_fk" FOREIGN KEY ("notice_version_id") REFERENCES "public"."consent_versions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "settings_processors" ADD CONSTRAINT "settings_processors_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "settings_dark_pattern_audits" ADD CONSTRAINT "settings_dark_pattern_audits_certificate_id_media_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "settings_dark_pattern_audits" ADD CONSTRAINT "settings_dark_pattern_audits_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_legal_order_idx" ON "pages_blocks_legal" USING btree ("_order");
  CREATE INDEX "pages_blocks_legal_parent_id_idx" ON "pages_blocks_legal" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_legal_path_idx" ON "pages_blocks_legal" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_legal_order_idx" ON "_pages_v_blocks_legal" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_legal_parent_id_idx" ON "_pages_v_blocks_legal" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_legal_path_idx" ON "_pages_v_blocks_legal" USING btree ("_path");
  CREATE INDEX "people_mobile_idx" ON "people" USING btree ("mobile");
  CREATE INDEX "people_email_idx" ON "people" USING btree ("email");
  CREATE INDEX "people_updated_at_idx" ON "people" USING btree ("updated_at");
  CREATE INDEX "people_created_at_idx" ON "people" USING btree ("created_at");
  CREATE INDEX "people_texts_order_parent" ON "people_texts" USING btree ("order","parent_id");
  CREATE UNIQUE INDEX "consents_withdraws_idx" ON "consents" USING btree ("withdraws_id");
  CREATE INDEX "consents_person_idx" ON "consents" USING btree ("person_id");
  CREATE INDEX "consents_notice_version_idx" ON "consents" USING btree ("notice_version_id");
  CREATE INDEX "consents_purpose_idx" ON "consents" USING btree ("purpose");
  CREATE INDEX "consents_granted_at_idx" ON "consents" USING btree ("granted_at");
  CREATE INDEX "consents_updated_at_idx" ON "consents" USING btree ("updated_at");
  CREATE INDEX "consents_created_at_idx" ON "consents" USING btree ("created_at");
  CREATE INDEX "consent_versions_purpose_idx" ON "consent_versions" USING btree ("purpose");
  CREATE INDEX "consent_versions_effective_from_idx" ON "consent_versions" USING btree ("effective_from");
  CREATE INDEX "consent_versions_updated_at_idx" ON "consent_versions" USING btree ("updated_at");
  CREATE INDEX "consent_versions_created_at_idx" ON "consent_versions" USING btree ("created_at");
  CREATE UNIQUE INDEX "purpose_language_version_idx" ON "consent_versions" USING btree ("purpose","language","version");
  CREATE INDEX "analytics_events_session_hash_idx" ON "analytics_events" USING btree ("session_hash");
  CREATE INDEX "analytics_events_at_idx" ON "analytics_events" USING btree ("at");
  CREATE INDEX "name_at_idx" ON "analytics_events" USING btree ("name","at");
  CREATE INDEX "settings_processors_order_idx" ON "settings_processors" USING btree ("_order");
  CREATE INDEX "settings_processors_parent_id_idx" ON "settings_processors" USING btree ("_parent_id");
  CREATE INDEX "settings_dark_pattern_audits_order_idx" ON "settings_dark_pattern_audits" USING btree ("_order");
  CREATE INDEX "settings_dark_pattern_audits_parent_id_idx" ON "settings_dark_pattern_audits" USING btree ("_parent_id");
  CREATE INDEX "settings_dark_pattern_audits_certificate_idx" ON "settings_dark_pattern_audits" USING btree ("certificate_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_people_fk" FOREIGN KEY ("people_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_consents_fk" FOREIGN KEY ("consents_id") REFERENCES "public"."consents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_consent_versions_fk" FOREIGN KEY ("consent_versions_id") REFERENCES "public"."consent_versions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_people_id_idx" ON "payload_locked_documents_rels" USING btree ("people_id");
  CREATE INDEX "payload_locked_documents_rels_consents_id_idx" ON "payload_locked_documents_rels" USING btree ("consents_id");
  CREATE INDEX "payload_locked_documents_rels_consent_versions_id_idx" ON "payload_locked_documents_rels" USING btree ("consent_versions_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_legal" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_legal" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "people" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "people_texts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "consents" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "consent_versions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "analytics_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "settings_processors" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "settings_dark_pattern_audits" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "settings" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "pages_blocks_legal" CASCADE;
  DROP TABLE "_pages_v_blocks_legal" CASCADE;
  DROP TABLE "people" CASCADE;
  DROP TABLE "people_texts" CASCADE;
  DROP TABLE "consents" CASCADE;
  DROP TABLE "consent_versions" CASCADE;
  DROP TABLE "analytics_events" CASCADE;
  DROP TABLE "settings_processors" CASCADE;
  DROP TABLE "settings_dark_pattern_audits" CASCADE;
  DROP TABLE "settings" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_people_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_consents_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_consent_versions_fk";
  
  DROP INDEX "payload_locked_documents_rels_people_id_idx";
  DROP INDEX "payload_locked_documents_rels_consents_id_idx";
  DROP INDEX "payload_locked_documents_rels_consent_versions_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "people_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "consents_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "consent_versions_id";
  DROP TYPE "public"."enum_people_mobileverifiedat_tz";
  DROP TYPE "public"."enum_people_emailverifiedat_tz";
  DROP TYPE "public"."enum_people_preferred_channel";
  DROP TYPE "public"."enum_people_language";
  DROP TYPE "public"."enum_people_age_band";
  DROP TYPE "public"."enum_consents_purpose";
  DROP TYPE "public"."enum_consents_language";
  DROP TYPE "public"."enum_consents_grantedat_tz";
  DROP TYPE "public"."enum_consents_withdrawnat_tz";
  DROP TYPE "public"."enum_consents_channel";
  DROP TYPE "public"."enum_consent_versions_purpose";
  DROP TYPE "public"."enum_consent_versions_language";
  DROP TYPE "public"."enum_consent_versions_effectivefrom_tz";
  DROP TYPE "public"."enum_analytics_events_name";
  DROP TYPE "public"."enum_analytics_events_register";
  DROP TYPE "public"."enum_analytics_events_who_for";
  DROP TYPE "public"."enum_analytics_events_at_tz";`)
}
