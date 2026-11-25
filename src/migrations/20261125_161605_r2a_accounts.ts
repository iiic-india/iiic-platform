import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_accounts_lastsigninat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_accounts_last_sign_in_channel" AS ENUM('email', 'whatsapp');
  CREATE TYPE "public"."enum_sign_in_requests_purpose" AS ENUM('signIn', 'addDetail');
  CREATE TYPE "public"."enum_sign_in_requests_channel" AS ENUM('email', 'whatsapp');
  ALTER TYPE "public"."enum_consents_purpose" ADD VALUE 'account';
  ALTER TYPE "public"."enum_consent_versions_purpose" ADD VALUE 'account';
  ALTER TYPE "public"."enum_messages_automation" ADD VALUE 'A1';
  ALTER TYPE "public"."enum_messages_automation" ADD VALUE 'A2';
  ALTER TYPE "public"."enum_messages_automation" ADD VALUE 'A3';
  ALTER TYPE "public"."enum_messages_template" ADD VALUE 'account-sign-in-code';
  ALTER TYPE "public"."enum_messages_template" ADD VALUE 'account-closed';
  ALTER TYPE "public"."enum_messages_template" ADD VALUE 'account-detail-added';
  ALTER TYPE "public"."enum_messages_recipient_kind" ADD VALUE 'signIn';
  ALTER TYPE "public"."enum_messages_subject_collection" ADD VALUE 'sign-in-requests';
  ALTER TYPE "public"."enum_messages_subject_collection" ADD VALUE 'accounts';
  ALTER TYPE "public"."enum_message_templates_key" ADD VALUE 'account-sign-in-code';
  ALTER TYPE "public"."enum_message_templates_key" ADD VALUE 'account-closed';
  ALTER TYPE "public"."enum_message_templates_key" ADD VALUE 'account-detail-added';
  ALTER TYPE "public"."enum__message_templates_v_version_key" ADD VALUE 'account-sign-in-code';
  ALTER TYPE "public"."enum__message_templates_v_version_key" ADD VALUE 'account-closed';
  ALTER TYPE "public"."enum__message_templates_v_version_key" ADD VALUE 'account-detail-added';
  ALTER TYPE "public"."enum_automations_key" ADD VALUE 'A1';
  ALTER TYPE "public"."enum_automations_key" ADD VALUE 'A2';
  ALTER TYPE "public"."enum_automations_key" ADD VALUE 'A3';
  CREATE TABLE "accounts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"auth_user_id" varchar,
  	"person_id" integer NOT NULL,
  	"last_sign_in_at" timestamp(3) with time zone,
  	"lastsigninat_tz" "enum_accounts_lastsigninat_tz" DEFAULT 'Asia/Kolkata',
  	"last_sign_in_channel" "enum_accounts_last_sign_in_channel",
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "sign_in_requests" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"purpose" "enum_sign_in_requests_purpose" NOT NULL,
  	"channel" "enum_sign_in_requests_channel" NOT NULL,
  	"identifier_hash" varchar NOT NULL,
  	"network_hash" varchar NOT NULL,
  	"requested_at" timestamp(3) with time zone NOT NULL
  );
  
  ALTER TABLE "people" ADD COLUMN "account_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "accounts_id" integer;
  ALTER TABLE "accounts" ADD CONSTRAINT "accounts_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "accounts_auth_user_id_idx" ON "accounts" USING btree ("auth_user_id");
  CREATE UNIQUE INDEX "accounts_person_idx" ON "accounts" USING btree ("person_id");
  CREATE INDEX "accounts_updated_at_idx" ON "accounts" USING btree ("updated_at");
  CREATE INDEX "accounts_created_at_idx" ON "accounts" USING btree ("created_at");
  CREATE INDEX "sign_in_requests_requested_at_idx" ON "sign_in_requests" USING btree ("requested_at");
  CREATE INDEX "identifierHash_requestedAt_idx" ON "sign_in_requests" USING btree ("identifier_hash","requested_at");
  CREATE INDEX "networkHash_requestedAt_idx" ON "sign_in_requests" USING btree ("network_hash","requested_at");
  ALTER TABLE "people" ADD CONSTRAINT "people_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_accounts_fk" FOREIGN KEY ("accounts_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "people_account_idx" ON "people" USING btree ("account_id");
  CREATE INDEX "payload_locked_documents_rels_accounts_id_idx" ON "payload_locked_documents_rels" USING btree ("accounts_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "accounts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "sign_in_requests" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "accounts" CASCADE;
  DROP TABLE "sign_in_requests" CASCADE;
  ALTER TABLE "people" DROP CONSTRAINT "people_account_id_accounts_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_accounts_fk";
  
  ALTER TABLE "consents" ALTER COLUMN "purpose" SET DATA TYPE text;
  DROP TYPE "public"."enum_consents_purpose";
  CREATE TYPE "public"."enum_consents_purpose" AS ENUM('bookingCommunications', 'marketingEmail', 'marketingWhatsapp', 'mapStorage', 'mapSharing', 'testimonialPublication', 'relatedProgrammes', 'enquiryReplies');
  ALTER TABLE "consents" ALTER COLUMN "purpose" SET DATA TYPE "public"."enum_consents_purpose" USING "purpose"::"public"."enum_consents_purpose";
  ALTER TABLE "consent_versions" ALTER COLUMN "purpose" SET DATA TYPE text;
  DROP TYPE "public"."enum_consent_versions_purpose";
  CREATE TYPE "public"."enum_consent_versions_purpose" AS ENUM('bookingCommunications', 'marketingEmail', 'marketingWhatsapp', 'mapStorage', 'mapSharing', 'testimonialPublication', 'relatedProgrammes', 'enquiryReplies');
  ALTER TABLE "consent_versions" ALTER COLUMN "purpose" SET DATA TYPE "public"."enum_consent_versions_purpose" USING "purpose"::"public"."enum_consent_versions_purpose";
  ALTER TABLE "messages" ALTER COLUMN "automation" SET DATA TYPE text;
  DROP TYPE "public"."enum_messages_automation";
  CREATE TYPE "public"."enum_messages_automation" AS ENUM('B1', 'B2', 'B3', 'B3a', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11', 'B12', 'B13', 'B14', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'N1', 'N2', 'N3', 'N4', 'O1', 'O2', 'O3', 'O4', 'O5', 'O6', 'O7', 'O8', 'O9', 'O10', 'V1', 'V2', 'C5');
  ALTER TABLE "messages" ALTER COLUMN "automation" SET DATA TYPE "public"."enum_messages_automation" USING "automation"::"public"."enum_messages_automation";
  ALTER TABLE "messages" ALTER COLUMN "template" SET DATA TYPE text;
  DROP TYPE "public"."enum_messages_template";
  CREATE TYPE "public"."enum_messages_template" AS ENUM('booking-confirmed', 'booking-receipt', 'consent-receipt', 'reminder-24h', 'reminder-short', 'booking-rescheduled', 'booking-cancelled', 'refund-processed', 'booking-change-staff', 'feedback-request', 'no-show', 'slot-lost', 'time-request-received', 'payment-link', 'payment-link-reminder', 'team-map-ack', 'partnership-ack', 'proposal-sent', 'newsletter-confirm', 'newsletter-welcome', 'newsletter-issue', 'data-request-ack', 'complaint-ack', 'privacy-deadline', 'review-consent-request', 'review-consent-reminder', 'review-withdrawal-confirmed', 'certificate-issued', 'daily-digest', 'weekly-report', 'incident-alert', 'backup-alert', 'failure-alert');
  ALTER TABLE "messages" ALTER COLUMN "template" SET DATA TYPE "public"."enum_messages_template" USING "template"::"public"."enum_messages_template";
  ALTER TABLE "messages" ALTER COLUMN "recipient_kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_messages_recipient_kind";
  CREATE TYPE "public"."enum_messages_recipient_kind" AS ENUM('person', 'subscriber', 'staff');
  ALTER TABLE "messages" ALTER COLUMN "recipient_kind" SET DATA TYPE "public"."enum_messages_recipient_kind" USING "recipient_kind"::"public"."enum_messages_recipient_kind";
  ALTER TABLE "messages" ALTER COLUMN "subject_collection" SET DATA TYPE text;
  DROP TYPE "public"."enum_messages_subject_collection";
  CREATE TYPE "public"."enum_messages_subject_collection" AS ENUM('bookings', 'payments', 'refunds', 'invoices', 'testimonials', 'consents', 'people', 'subscribers', 'newsletter-issues', 'messages', 'suppressions', 'users', 'enquiries', 'leads', 'proposals', 'certificates', 'data-requests', 'incidents');
  ALTER TABLE "messages" ALTER COLUMN "subject_collection" SET DATA TYPE "public"."enum_messages_subject_collection" USING "subject_collection"::"public"."enum_messages_subject_collection";
  ALTER TABLE "message_templates" ALTER COLUMN "key" SET DATA TYPE text;
  DROP TYPE "public"."enum_message_templates_key";
  CREATE TYPE "public"."enum_message_templates_key" AS ENUM('booking-confirmed', 'booking-receipt', 'consent-receipt', 'reminder-24h', 'reminder-short', 'booking-rescheduled', 'booking-cancelled', 'refund-processed', 'booking-change-staff', 'feedback-request', 'no-show', 'slot-lost', 'time-request-received', 'payment-link', 'payment-link-reminder', 'team-map-ack', 'partnership-ack', 'proposal-sent', 'newsletter-confirm', 'newsletter-welcome', 'newsletter-issue', 'data-request-ack', 'complaint-ack', 'privacy-deadline', 'review-consent-request', 'review-consent-reminder', 'review-withdrawal-confirmed', 'certificate-issued', 'daily-digest', 'weekly-report', 'incident-alert', 'backup-alert', 'failure-alert');
  ALTER TABLE "message_templates" ALTER COLUMN "key" SET DATA TYPE "public"."enum_message_templates_key" USING "key"::"public"."enum_message_templates_key";
  ALTER TABLE "_message_templates_v" ALTER COLUMN "version_key" SET DATA TYPE text;
  DROP TYPE "public"."enum__message_templates_v_version_key";
  CREATE TYPE "public"."enum__message_templates_v_version_key" AS ENUM('booking-confirmed', 'booking-receipt', 'consent-receipt', 'reminder-24h', 'reminder-short', 'booking-rescheduled', 'booking-cancelled', 'refund-processed', 'booking-change-staff', 'feedback-request', 'no-show', 'slot-lost', 'time-request-received', 'payment-link', 'payment-link-reminder', 'team-map-ack', 'partnership-ack', 'proposal-sent', 'newsletter-confirm', 'newsletter-welcome', 'newsletter-issue', 'data-request-ack', 'complaint-ack', 'privacy-deadline', 'review-consent-request', 'review-consent-reminder', 'review-withdrawal-confirmed', 'certificate-issued', 'daily-digest', 'weekly-report', 'incident-alert', 'backup-alert', 'failure-alert');
  ALTER TABLE "_message_templates_v" ALTER COLUMN "version_key" SET DATA TYPE "public"."enum__message_templates_v_version_key" USING "version_key"::"public"."enum__message_templates_v_version_key";
  ALTER TABLE "automations" ALTER COLUMN "key" SET DATA TYPE text;
  DROP TYPE "public"."enum_automations_key";
  CREATE TYPE "public"."enum_automations_key" AS ENUM('B1', 'B2', 'B3', 'B3a', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11', 'B12', 'B13', 'B14', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'N1', 'N2', 'N3', 'N4', 'O1', 'O2', 'O3', 'O4', 'O5', 'O6', 'O7', 'O8', 'O9', 'O10', 'V1', 'V2', 'C5');
  ALTER TABLE "automations" ALTER COLUMN "key" SET DATA TYPE "public"."enum_automations_key" USING "key"::"public"."enum_automations_key";
  DROP INDEX "people_account_idx";
  DROP INDEX "payload_locked_documents_rels_accounts_id_idx";
  ALTER TABLE "people" DROP COLUMN "account_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "accounts_id";
  DROP TYPE "public"."enum_accounts_lastsigninat_tz";
  DROP TYPE "public"."enum_accounts_last_sign_in_channel";
  DROP TYPE "public"."enum_sign_in_requests_purpose";
  DROP TYPE "public"."enum_sign_in_requests_channel";`)
}
