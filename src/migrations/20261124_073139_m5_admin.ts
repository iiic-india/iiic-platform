import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_certificates_status" AS ENUM('valid', 'revoked');
  CREATE TYPE "public"."enum_certificates_issuedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_certificates_revocation_at_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_data_requests_type" AS ENUM('access', 'correction', 'erasure', 'withdrawal', 'nomination', 'consumerComplaint', 'privacyGrievance');
  CREATE TYPE "public"."enum_data_requests_status" AS ENUM('received', 'acknowledged', 'verified', 'preparing', 'awaitingOwner', 'closed');
  CREATE TYPE "public"."enum_data_requests_channel" AS ENUM('web', 'email', 'whatsapp', 'phone', 'letter', 'inPerson');
  CREATE TYPE "public"."enum_data_requests_receivedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_data_requests_acknowledgeby_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_data_requests_resolveby_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_data_requests_acknowledgedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_data_requests_complaintcopysentat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_data_requests_verifiedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_data_requests_verification_method" AS ENUM('oneTimeCode', 'detailsMatch', 'inPerson');
  CREATE TYPE "public"."enum_data_requests_resolution_outcome" AS ENUM('fulfilled', 'partly', 'refused', 'withdrawn');
  CREATE TYPE "public"."enum_data_requests_resolution_closedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_data_requests_resolution_erasureconfirmedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_incidents_detectedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_incidents_status" AS ENUM('open', 'contained', 'closed');
  CREATE TYPE "public"."enum_incidents_containedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_incidents_cert_in_dueat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_incidents_cert_in_reportedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_incidents_people_notifiedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_incidents_board_dueat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_incidents_board_notifiedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_incidents_board_detailedreportat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_incidents_closedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_feedback_status" AS ENUM('new', 'read');
  CREATE TYPE "public"."enum_case_studies_status" AS ENUM('draft', 'awaitingApproval', 'approved', 'published', 'withdrawn');
  CREATE TABLE "session_notes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"booking_id" integer NOT NULL,
  	"person_id" integer NOT NULL,
  	"author_id" integer NOT NULL,
  	"sealed" jsonb NOT NULL,
  	"key_id" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "certificates" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"certificate_id" varchar NOT NULL,
  	"status" "enum_certificates_status" DEFAULT 'valid' NOT NULL,
  	"person_id" integer NOT NULL,
  	"name_as_printed" varchar NOT NULL,
  	"programme_name" varchar NOT NULL,
  	"programme_details" varchar,
  	"completed_on" varchar NOT NULL,
  	"issued_at" timestamp(3) with time zone,
  	"issuedat_tz" "enum_certificates_issuedat_tz" DEFAULT 'Asia/Kolkata',
  	"issued_by_id" integer,
  	"batch" varchar,
  	"verify_token_hash" varchar NOT NULL,
  	"pdf_key" varchar,
  	"pdf_sha256" varchar,
  	"revocation_at" timestamp(3) with time zone,
  	"revocation_at_tz" "enum_certificates_revocation_at_tz" DEFAULT 'Asia/Kolkata',
  	"revocation_by_id" integer,
  	"revocation_reason" varchar,
  	"replaces_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "data_requests" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"type" "enum_data_requests_type" NOT NULL,
  	"status" "enum_data_requests_status" DEFAULT 'received' NOT NULL,
  	"assignee_id" integer,
  	"person_id" integer NOT NULL,
  	"channel" "enum_data_requests_channel" NOT NULL,
  	"received_at" timestamp(3) with time zone NOT NULL,
  	"receivedat_tz" "enum_data_requests_receivedat_tz" DEFAULT 'Asia/Kolkata' NOT NULL,
  	"summary" varchar NOT NULL,
  	"acknowledge_by" timestamp(3) with time zone,
  	"acknowledgeby_tz" "enum_data_requests_acknowledgeby_tz" DEFAULT 'Asia/Kolkata',
  	"resolve_by" timestamp(3) with time zone,
  	"resolveby_tz" "enum_data_requests_resolveby_tz" DEFAULT 'Asia/Kolkata',
  	"acknowledged_at" timestamp(3) with time zone,
  	"acknowledgedat_tz" "enum_data_requests_acknowledgedat_tz" DEFAULT 'Asia/Kolkata',
  	"complaint_copy_sent_at" timestamp(3) with time zone,
  	"complaintcopysentat_tz" "enum_data_requests_complaintcopysentat_tz" DEFAULT 'Asia/Kolkata',
  	"verified_at" timestamp(3) with time zone,
  	"verifiedat_tz" "enum_data_requests_verifiedat_tz" DEFAULT 'Asia/Kolkata',
  	"verification_method" "enum_data_requests_verification_method",
  	"export_key" varchar,
  	"resolution_outcome" "enum_data_requests_resolution_outcome",
  	"resolution_closed_at" timestamp(3) with time zone,
  	"resolution_closedat_tz" "enum_data_requests_resolution_closedat_tz" DEFAULT 'Asia/Kolkata',
  	"resolution_note" varchar,
  	"resolution_erasure_confirmed_at" timestamp(3) with time zone,
  	"resolution_erasureconfirmedat_tz" "enum_data_requests_resolution_erasureconfirmedat_tz" DEFAULT 'Asia/Kolkata',
  	"resolution_decided_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "incidents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"detected_at" timestamp(3) with time zone NOT NULL,
  	"detectedat_tz" "enum_incidents_detectedat_tz" DEFAULT 'Asia/Kolkata' NOT NULL,
  	"status" "enum_incidents_status" DEFAULT 'open' NOT NULL,
  	"contained_at" timestamp(3) with time zone,
  	"containedat_tz" "enum_incidents_containedat_tz" DEFAULT 'Asia/Kolkata',
  	"description" varchar NOT NULL,
  	"systems" varchar,
  	"personal_data_affected" boolean,
  	"personal_data_kinds" varchar,
  	"personal_data_people_affected" numeric,
  	"cert_in_reportable" boolean,
  	"cert_in_due_at" timestamp(3) with time zone,
  	"cert_in_dueat_tz" "enum_incidents_cert_in_dueat_tz" DEFAULT 'Asia/Kolkata',
  	"cert_in_reported_at" timestamp(3) with time zone,
  	"cert_in_reportedat_tz" "enum_incidents_cert_in_reportedat_tz" DEFAULT 'Asia/Kolkata',
  	"cert_in_reference" varchar,
  	"people_notified_at" timestamp(3) with time zone,
  	"people_notifiedat_tz" "enum_incidents_people_notifiedat_tz" DEFAULT 'Asia/Kolkata',
  	"people_how" varchar,
  	"people_count" numeric,
  	"board_due_at" timestamp(3) with time zone,
  	"board_dueat_tz" "enum_incidents_board_dueat_tz" DEFAULT 'Asia/Kolkata',
  	"board_notified_at" timestamp(3) with time zone,
  	"board_notifiedat_tz" "enum_incidents_board_notifiedat_tz" DEFAULT 'Asia/Kolkata',
  	"board_detailed_report_at" timestamp(3) with time zone,
  	"board_detailedreportat_tz" "enum_incidents_board_detailedreportat_tz" DEFAULT 'Asia/Kolkata',
  	"board_reference" varchar,
  	"remediation" varchar,
  	"closed_at" timestamp(3) with time zone,
  	"closedat_tz" "enum_incidents_closedat_tz" DEFAULT 'Asia/Kolkata',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "feedback" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"booking_id" integer NOT NULL,
  	"person_id" integer NOT NULL,
  	"rating" numeric NOT NULL,
  	"submitted_at" timestamp(3) with time zone NOT NULL,
  	"status" "enum_feedback_status" DEFAULT 'new' NOT NULL,
  	"comment" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "case_studies_outcomes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"statement" varchar NOT NULL,
  	"evidence" varchar NOT NULL
  );
  
  CREATE TABLE "case_studies" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"client_name" varchar NOT NULL,
  	"organisation_id" integer,
  	"sector" varchar,
  	"status" "enum_case_studies_status" DEFAULT 'draft' NOT NULL,
  	"problem" varchar NOT NULL,
  	"approach" varchar NOT NULL,
  	"client_approval_approver_name" varchar,
  	"client_approval_approver_role" varchar,
  	"client_approval_approved_on" varchar,
  	"client_approval_reference" varchar,
  	"published_by_id" integer,
  	"published_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "certificates_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "data_requests_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "incidents_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "feedback_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "case_studies_id" integer;
  ALTER TABLE "settings" ADD COLUMN "certificates_signatory_name" varchar;
  ALTER TABLE "settings" ADD COLUMN "certificates_signatory_title" varchar;
  ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "certificates" ADD CONSTRAINT "certificates_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "certificates" ADD CONSTRAINT "certificates_issued_by_id_users_id_fk" FOREIGN KEY ("issued_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "certificates" ADD CONSTRAINT "certificates_revocation_by_id_users_id_fk" FOREIGN KEY ("revocation_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "certificates" ADD CONSTRAINT "certificates_replaces_id_certificates_id_fk" FOREIGN KEY ("replaces_id") REFERENCES "public"."certificates"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_resolution_decided_by_id_users_id_fk" FOREIGN KEY ("resolution_decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "feedback" ADD CONSTRAINT "feedback_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "feedback" ADD CONSTRAINT "feedback_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "case_studies_outcomes" ADD CONSTRAINT "case_studies_outcomes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."case_studies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "case_studies" ADD CONSTRAINT "case_studies_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "case_studies" ADD CONSTRAINT "case_studies_published_by_id_users_id_fk" FOREIGN KEY ("published_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "session_notes_booking_idx" ON "session_notes" USING btree ("booking_id");
  CREATE INDEX "session_notes_person_idx" ON "session_notes" USING btree ("person_id");
  CREATE INDEX "session_notes_author_idx" ON "session_notes" USING btree ("author_id");
  CREATE INDEX "session_notes_key_id_idx" ON "session_notes" USING btree ("key_id");
  CREATE INDEX "session_notes_updated_at_idx" ON "session_notes" USING btree ("updated_at");
  CREATE INDEX "session_notes_created_at_idx" ON "session_notes" USING btree ("created_at");
  CREATE UNIQUE INDEX "certificates_certificate_id_idx" ON "certificates" USING btree ("certificate_id");
  CREATE INDEX "certificates_status_idx" ON "certificates" USING btree ("status");
  CREATE INDEX "certificates_person_idx" ON "certificates" USING btree ("person_id");
  CREATE INDEX "certificates_issued_by_idx" ON "certificates" USING btree ("issued_by_id");
  CREATE INDEX "certificates_batch_idx" ON "certificates" USING btree ("batch");
  CREATE UNIQUE INDEX "certificates_verify_token_hash_idx" ON "certificates" USING btree ("verify_token_hash");
  CREATE INDEX "certificates_revocation_revocation_by_idx" ON "certificates" USING btree ("revocation_by_id");
  CREATE UNIQUE INDEX "certificates_replaces_idx" ON "certificates" USING btree ("replaces_id");
  CREATE INDEX "certificates_updated_at_idx" ON "certificates" USING btree ("updated_at");
  CREATE INDEX "certificates_created_at_idx" ON "certificates" USING btree ("created_at");
  CREATE INDEX "data_requests_type_idx" ON "data_requests" USING btree ("type");
  CREATE INDEX "data_requests_status_idx" ON "data_requests" USING btree ("status");
  CREATE INDEX "data_requests_assignee_idx" ON "data_requests" USING btree ("assignee_id");
  CREATE INDEX "data_requests_person_idx" ON "data_requests" USING btree ("person_id");
  CREATE INDEX "data_requests_received_at_idx" ON "data_requests" USING btree ("received_at");
  CREATE INDEX "data_requests_acknowledge_by_idx" ON "data_requests" USING btree ("acknowledge_by");
  CREATE INDEX "data_requests_resolve_by_idx" ON "data_requests" USING btree ("resolve_by");
  CREATE INDEX "data_requests_resolution_resolution_decided_by_idx" ON "data_requests" USING btree ("resolution_decided_by_id");
  CREATE INDEX "data_requests_updated_at_idx" ON "data_requests" USING btree ("updated_at");
  CREATE INDEX "data_requests_created_at_idx" ON "data_requests" USING btree ("created_at");
  CREATE INDEX "incidents_detected_at_idx" ON "incidents" USING btree ("detected_at");
  CREATE INDEX "incidents_status_idx" ON "incidents" USING btree ("status");
  CREATE INDEX "incidents_updated_at_idx" ON "incidents" USING btree ("updated_at");
  CREATE INDEX "incidents_created_at_idx" ON "incidents" USING btree ("created_at");
  CREATE UNIQUE INDEX "feedback_booking_idx" ON "feedback" USING btree ("booking_id");
  CREATE INDEX "feedback_person_idx" ON "feedback" USING btree ("person_id");
  CREATE INDEX "feedback_submitted_at_idx" ON "feedback" USING btree ("submitted_at");
  CREATE INDEX "feedback_status_idx" ON "feedback" USING btree ("status");
  CREATE INDEX "feedback_updated_at_idx" ON "feedback" USING btree ("updated_at");
  CREATE INDEX "feedback_created_at_idx" ON "feedback" USING btree ("created_at");
  CREATE INDEX "case_studies_outcomes_order_idx" ON "case_studies_outcomes" USING btree ("_order");
  CREATE INDEX "case_studies_outcomes_parent_id_idx" ON "case_studies_outcomes" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "case_studies_slug_idx" ON "case_studies" USING btree ("slug");
  CREATE INDEX "case_studies_organisation_idx" ON "case_studies" USING btree ("organisation_id");
  CREATE INDEX "case_studies_status_idx" ON "case_studies" USING btree ("status");
  CREATE INDEX "case_studies_published_by_idx" ON "case_studies" USING btree ("published_by_id");
  CREATE INDEX "case_studies_updated_at_idx" ON "case_studies" USING btree ("updated_at");
  CREATE INDEX "case_studies_created_at_idx" ON "case_studies" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_certificates_fk" FOREIGN KEY ("certificates_id") REFERENCES "public"."certificates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_data_requests_fk" FOREIGN KEY ("data_requests_id") REFERENCES "public"."data_requests"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_incidents_fk" FOREIGN KEY ("incidents_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_feedback_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_case_studies_fk" FOREIGN KEY ("case_studies_id") REFERENCES "public"."case_studies"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_certificates_id_idx" ON "payload_locked_documents_rels" USING btree ("certificates_id");
  CREATE INDEX "payload_locked_documents_rels_data_requests_id_idx" ON "payload_locked_documents_rels" USING btree ("data_requests_id");
  CREATE INDEX "payload_locked_documents_rels_incidents_id_idx" ON "payload_locked_documents_rels" USING btree ("incidents_id");
  CREATE INDEX "payload_locked_documents_rels_feedback_id_idx" ON "payload_locked_documents_rels" USING btree ("feedback_id");
  CREATE INDEX "payload_locked_documents_rels_case_studies_id_idx" ON "payload_locked_documents_rels" USING btree ("case_studies_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "session_notes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "certificates" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "data_requests" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "incidents" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "feedback" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "case_studies_outcomes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "case_studies" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "session_notes" CASCADE;
  DROP TABLE "certificates" CASCADE;
  DROP TABLE "data_requests" CASCADE;
  DROP TABLE "incidents" CASCADE;
  DROP TABLE "feedback" CASCADE;
  DROP TABLE "case_studies_outcomes" CASCADE;
  DROP TABLE "case_studies" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_certificates_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_data_requests_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_incidents_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_feedback_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_case_studies_fk";
  
  DROP INDEX "payload_locked_documents_rels_certificates_id_idx";
  DROP INDEX "payload_locked_documents_rels_data_requests_id_idx";
  DROP INDEX "payload_locked_documents_rels_incidents_id_idx";
  DROP INDEX "payload_locked_documents_rels_feedback_id_idx";
  DROP INDEX "payload_locked_documents_rels_case_studies_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "certificates_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "data_requests_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "incidents_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "feedback_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "case_studies_id";
  ALTER TABLE "settings" DROP COLUMN "certificates_signatory_name";
  ALTER TABLE "settings" DROP COLUMN "certificates_signatory_title";
  DROP TYPE "public"."enum_certificates_status";
  DROP TYPE "public"."enum_certificates_issuedat_tz";
  DROP TYPE "public"."enum_certificates_revocation_at_tz";
  DROP TYPE "public"."enum_data_requests_type";
  DROP TYPE "public"."enum_data_requests_status";
  DROP TYPE "public"."enum_data_requests_channel";
  DROP TYPE "public"."enum_data_requests_receivedat_tz";
  DROP TYPE "public"."enum_data_requests_acknowledgeby_tz";
  DROP TYPE "public"."enum_data_requests_resolveby_tz";
  DROP TYPE "public"."enum_data_requests_acknowledgedat_tz";
  DROP TYPE "public"."enum_data_requests_complaintcopysentat_tz";
  DROP TYPE "public"."enum_data_requests_verifiedat_tz";
  DROP TYPE "public"."enum_data_requests_verification_method";
  DROP TYPE "public"."enum_data_requests_resolution_outcome";
  DROP TYPE "public"."enum_data_requests_resolution_closedat_tz";
  DROP TYPE "public"."enum_data_requests_resolution_erasureconfirmedat_tz";
  DROP TYPE "public"."enum_incidents_detectedat_tz";
  DROP TYPE "public"."enum_incidents_status";
  DROP TYPE "public"."enum_incidents_containedat_tz";
  DROP TYPE "public"."enum_incidents_cert_in_dueat_tz";
  DROP TYPE "public"."enum_incidents_cert_in_reportedat_tz";
  DROP TYPE "public"."enum_incidents_people_notifiedat_tz";
  DROP TYPE "public"."enum_incidents_board_dueat_tz";
  DROP TYPE "public"."enum_incidents_board_notifiedat_tz";
  DROP TYPE "public"."enum_incidents_board_detailedreportat_tz";
  DROP TYPE "public"."enum_incidents_closedat_tz";
  DROP TYPE "public"."enum_feedback_status";
  DROP TYPE "public"."enum_case_studies_status";`)
}
