import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_people_whatsapplastinboundat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_messages_automation" AS ENUM('B1', 'B2', 'B3', 'B3a', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11', 'B12', 'B13', 'B14', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'N1', 'N2', 'N3', 'N4', 'O1', 'O2', 'O3', 'O4', 'O5', 'O6', 'O7', 'O8', 'O9', 'O10', 'V1', 'V2', 'C5');
  CREATE TYPE "public"."enum_messages_template" AS ENUM('booking-confirmed', 'booking-receipt', 'consent-receipt', 'reminder-24h', 'reminder-short', 'booking-rescheduled', 'booking-cancelled', 'refund-processed', 'booking-change-staff', 'feedback-request', 'no-show', 'slot-lost', 'time-request-received', 'payment-link', 'payment-link-reminder', 'team-map-ack', 'partnership-ack', 'proposal-sent', 'newsletter-confirm', 'newsletter-welcome', 'newsletter-issue', 'data-request-ack', 'complaint-ack', 'privacy-deadline', 'review-consent-request', 'review-consent-reminder', 'review-withdrawal-confirmed', 'certificate-issued', 'daily-digest', 'weekly-report', 'incident-alert', 'backup-alert', 'failure-alert');
  CREATE TYPE "public"."enum_messages_channel" AS ENUM('email', 'whatsapp');
  CREATE TYPE "public"."enum_messages_fallback" AS ENUM('email', 'whatsapp');
  CREATE TYPE "public"."enum_messages_kind" AS ENUM('transactional', 'promotional', 'operator', 'internal');
  CREATE TYPE "public"."enum_messages_sender" AS ENUM('bookings', 'hello', 'platform', 'journal');
  CREATE TYPE "public"."enum_messages_status" AS ENUM('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'bounced', 'complained', 'skipped', 'cancelled', 'unknown');
  CREATE TYPE "public"."enum_messages_skip_reason" AS ENUM('paused', 'no-address', 'suppressed', 'no-consent', 'under-18', 'not-configured', 'template-not-approved', 'window-closed', 'too-late', 'quiet-hours-late', 'stale', 'price-hidden');
  CREATE TYPE "public"."enum_messages_recipient_kind" AS ENUM('person', 'subscriber', 'staff');
  CREATE TYPE "public"."enum_messages_subject_collection" AS ENUM('bookings', 'payments', 'refunds', 'invoices', 'testimonials', 'consents', 'people', 'subscribers', 'newsletter-issues', 'messages', 'suppressions', 'users', 'enquiries', 'leads', 'proposals', 'certificates', 'data-requests', 'incidents');
  CREATE TYPE "public"."enum_messages_sendat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_messages_sendbefore_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_messages_claimedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_messages_sentat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_messages_deliveredat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_messages_readat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_messages_provider" AS ENUM('resend', 'aisensy', 'fake');
  CREATE TYPE "public"."enum_message_templates_key" AS ENUM('booking-confirmed', 'booking-receipt', 'consent-receipt', 'reminder-24h', 'reminder-short', 'booking-rescheduled', 'booking-cancelled', 'refund-processed', 'booking-change-staff', 'feedback-request', 'no-show', 'slot-lost', 'time-request-received', 'payment-link', 'payment-link-reminder', 'team-map-ack', 'partnership-ack', 'proposal-sent', 'newsletter-confirm', 'newsletter-welcome', 'newsletter-issue', 'data-request-ack', 'complaint-ack', 'privacy-deadline', 'review-consent-request', 'review-consent-reminder', 'review-withdrawal-confirmed', 'certificate-issued', 'daily-digest', 'weekly-report', 'incident-alert', 'backup-alert', 'failure-alert');
  CREATE TYPE "public"."enum_message_templates_channel" AS ENUM('email', 'whatsapp');
  CREATE TYPE "public"."enum_message_templates_language" AS ENUM('en-IN', 'gu-IN', 'hi-IN');
  CREATE TYPE "public"."enum_message_templates_category" AS ENUM('utility', 'marketing', 'authentication');
  CREATE TYPE "public"."enum_message_templates_status" AS ENUM('draft', 'submitted', 'approved', 'rejected', 'paused');
  CREATE TYPE "public"."enum_message_templates_lastreviewedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum__message_templates_v_version_key" AS ENUM('booking-confirmed', 'booking-receipt', 'consent-receipt', 'reminder-24h', 'reminder-short', 'booking-rescheduled', 'booking-cancelled', 'refund-processed', 'booking-change-staff', 'feedback-request', 'no-show', 'slot-lost', 'time-request-received', 'payment-link', 'payment-link-reminder', 'team-map-ack', 'partnership-ack', 'proposal-sent', 'newsletter-confirm', 'newsletter-welcome', 'newsletter-issue', 'data-request-ack', 'complaint-ack', 'privacy-deadline', 'review-consent-request', 'review-consent-reminder', 'review-withdrawal-confirmed', 'certificate-issued', 'daily-digest', 'weekly-report', 'incident-alert', 'backup-alert', 'failure-alert');
  CREATE TYPE "public"."enum__message_templates_v_version_channel" AS ENUM('email', 'whatsapp');
  CREATE TYPE "public"."enum__message_templates_v_version_language" AS ENUM('en-IN', 'gu-IN', 'hi-IN');
  CREATE TYPE "public"."enum__message_templates_v_version_category" AS ENUM('utility', 'marketing', 'authentication');
  CREATE TYPE "public"."enum__message_templates_v_version_status" AS ENUM('draft', 'submitted', 'approved', 'rejected', 'paused');
  CREATE TYPE "public"."enum__message_templates_v_version_lastreviewedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_automations_key" AS ENUM('B1', 'B2', 'B3', 'B3a', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11', 'B12', 'B13', 'B14', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'N1', 'N2', 'N3', 'N4', 'O1', 'O2', 'O3', 'O4', 'O5', 'O6', 'O7', 'O8', 'O9', 'O10', 'V1', 'V2', 'C5');
  CREATE TYPE "public"."enum_automations_lastrunat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_suppressions_channel" AS ENUM('email', 'whatsapp');
  CREATE TYPE "public"."enum_suppressions_reason" AS ENUM('hardBounce', 'complaint', 'whatsappStop', 'manual');
  CREATE TYPE "public"."enum_suppressions_at_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_suppressions_source" AS ENUM('resend', 'whatsapp', 'staff');
  CREATE TYPE "public"."enum_subscribers_status" AS ENUM('pending', 'confirmed', 'unsubscribed');
  CREATE TYPE "public"."enum_subscribers_confirmexpiresat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_subscribers_confirmedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_subscribers_unsubscribedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_subscribers_lastengagedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_newsletter_issues_status" AS ENUM('draft', 'scheduled', 'sending', 'sent', 'cancelled');
  CREATE TYPE "public"."enum_newsletter_issues_scheduledfor_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_newsletter_issues_sentat_tz" AS ENUM('Asia/Kolkata');
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'messages-dispatch';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'O3-failure-alert';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'B2-confirmation';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'B3-receipt';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'B3a-consent-receipt';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'B5-reminder-24h';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'B6-reminder-2h';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'B7-change-notice';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'B8-feedback-request';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'B9-no-show';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'B10-slot-lost';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'B12-time-request-ack';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'B13-payment-link';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'O1-daily-digest';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'O2-weekly-report';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'O5-retention';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'O6-backup-check';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'O9-bounce-complaint';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'V1-review-consent-request';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'V2-withdrawal-confirmation';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'P1-team-map-ack';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'P6-proposal-follow-up';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'P7-partnership-ack';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'O4-data-request';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'O7-complaint';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'O8-incident-timers';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'C5-certificate-email';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'N1-confirm-signup';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'N2-welcome';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'N3-unsubscribe';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'N4-send-issue';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'messages-dispatch';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'O3-failure-alert';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'B2-confirmation';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'B3-receipt';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'B3a-consent-receipt';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'B5-reminder-24h';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'B6-reminder-2h';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'B7-change-notice';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'B8-feedback-request';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'B9-no-show';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'B10-slot-lost';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'B12-time-request-ack';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'B13-payment-link';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'O1-daily-digest';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'O2-weekly-report';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'O5-retention';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'O6-backup-check';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'O9-bounce-complaint';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'V1-review-consent-request';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'V2-withdrawal-confirmation';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'P1-team-map-ack';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'P6-proposal-follow-up';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'P7-partnership-ack';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'O4-data-request';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'O7-complaint';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'O8-incident-timers';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'C5-certificate-email';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'N1-confirm-signup';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'N2-welcome';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'N3-unsubscribe';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'N4-send-issue';
  CREATE TABLE "messages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"dedupe_key" varchar NOT NULL,
  	"automation" "enum_messages_automation" NOT NULL,
  	"template" "enum_messages_template" NOT NULL,
  	"variant" varchar,
  	"channel" "enum_messages_channel" NOT NULL,
  	"fallback" "enum_messages_fallback",
  	"kind" "enum_messages_kind" NOT NULL,
  	"sender" "enum_messages_sender",
  	"status" "enum_messages_status" DEFAULT 'queued' NOT NULL,
  	"skip_reason" "enum_messages_skip_reason",
  	"last_error" varchar,
  	"recipient_kind" "enum_messages_recipient_kind" NOT NULL,
  	"person_id" integer,
  	"subscriber_id" integer,
  	"staff_id" integer,
  	"subject_collection" "enum_messages_subject_collection" NOT NULL,
  	"subject_id" numeric NOT NULL,
  	"counselling" boolean DEFAULT false,
  	"fallback_of_id" integer,
  	"send_at" timestamp(3) with time zone,
  	"sendat_tz" "enum_messages_sendat_tz" DEFAULT 'Asia/Kolkata',
  	"send_before" timestamp(3) with time zone,
  	"sendbefore_tz" "enum_messages_sendbefore_tz" DEFAULT 'Asia/Kolkata',
  	"requires_open_window" boolean DEFAULT false,
  	"attempts" numeric DEFAULT 0,
  	"claimed_at" timestamp(3) with time zone,
  	"claimedat_tz" "enum_messages_claimedat_tz" DEFAULT 'Asia/Kolkata',
  	"sent_at" timestamp(3) with time zone,
  	"sentat_tz" "enum_messages_sentat_tz" DEFAULT 'Asia/Kolkata',
  	"delivered_at" timestamp(3) with time zone,
  	"deliveredat_tz" "enum_messages_deliveredat_tz" DEFAULT 'Asia/Kolkata',
  	"read_at" timestamp(3) with time zone,
  	"readat_tz" "enum_messages_readat_tz" DEFAULT 'Asia/Kolkata',
  	"provider" "enum_messages_provider",
  	"provider_message_id" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "message_templates" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" "enum_message_templates_key" NOT NULL,
  	"channel" "enum_message_templates_channel" NOT NULL,
  	"language" "enum_message_templates_language" DEFAULT 'en-IN' NOT NULL,
  	"subject" varchar,
  	"preheader" varchar,
  	"body" varchar,
  	"provider_template_name" varchar,
  	"category" "enum_message_templates_category",
  	"status" "enum_message_templates_status" DEFAULT 'draft' NOT NULL,
  	"owner_id" integer,
  	"last_reviewed_at" timestamp(3) with time zone,
  	"lastreviewedat_tz" "enum_message_templates_lastreviewedat_tz" DEFAULT 'Asia/Kolkata',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_message_templates_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_key" "enum__message_templates_v_version_key" NOT NULL,
  	"version_channel" "enum__message_templates_v_version_channel" NOT NULL,
  	"version_language" "enum__message_templates_v_version_language" DEFAULT 'en-IN' NOT NULL,
  	"version_subject" varchar,
  	"version_preheader" varchar,
  	"version_body" varchar,
  	"version_provider_template_name" varchar,
  	"version_category" "enum__message_templates_v_version_category",
  	"version_status" "enum__message_templates_v_version_status" DEFAULT 'draft' NOT NULL,
  	"version_owner_id" integer,
  	"version_last_reviewed_at" timestamp(3) with time zone,
  	"version_lastreviewedat_tz" "enum__message_templates_v_version_lastreviewedat_tz" DEFAULT 'Asia/Kolkata',
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "automations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" "enum_automations_key" NOT NULL,
  	"enabled" boolean DEFAULT true,
  	"note" varchar,
  	"last_run_at" timestamp(3) with time zone,
  	"lastrunat_tz" "enum_automations_lastrunat_tz" DEFAULT 'Asia/Kolkata',
  	"success_count" numeric DEFAULT 0,
  	"failure_count" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "suppressions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"channel" "enum_suppressions_channel" NOT NULL,
  	"address" varchar NOT NULL,
  	"reason" "enum_suppressions_reason" NOT NULL,
  	"at" timestamp(3) with time zone NOT NULL,
  	"at_tz" "enum_suppressions_at_tz" DEFAULT 'Asia/Kolkata' NOT NULL,
  	"source" "enum_suppressions_source" DEFAULT 'staff' NOT NULL,
  	"person_id" integer,
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "subscribers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"email" varchar NOT NULL,
  	"status" "enum_subscribers_status" DEFAULT 'pending' NOT NULL,
  	"source" varchar,
  	"notice_id" integer,
  	"person_id" integer,
  	"consent_id" integer,
  	"confirm_expires_at" timestamp(3) with time zone,
  	"confirmexpiresat_tz" "enum_subscribers_confirmexpiresat_tz" DEFAULT 'Asia/Kolkata',
  	"confirmed_at" timestamp(3) with time zone,
  	"confirmedat_tz" "enum_subscribers_confirmedat_tz" DEFAULT 'Asia/Kolkata',
  	"unsubscribed_at" timestamp(3) with time zone,
  	"unsubscribedat_tz" "enum_subscribers_unsubscribedat_tz" DEFAULT 'Asia/Kolkata',
  	"last_engaged_at" timestamp(3) with time zone,
  	"lastengagedat_tz" "enum_subscribers_lastengagedat_tz" DEFAULT 'Asia/Kolkata',
  	"confirm_token_hash" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "newsletter_issues_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"post_id" integer NOT NULL,
  	"note" varchar
  );
  
  CREATE TABLE "newsletter_issues" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"number" numeric NOT NULL,
  	"title" varchar NOT NULL,
  	"preheader" varchar NOT NULL,
  	"lead_post_id" integer NOT NULL,
  	"lead_note" varchar,
  	"cta_label" varchar,
  	"cta_path" varchar,
  	"status" "enum_newsletter_issues_status" DEFAULT 'draft' NOT NULL,
  	"scheduled_for" timestamp(3) with time zone,
  	"scheduledfor_tz" "enum_newsletter_issues_scheduledfor_tz" DEFAULT 'Asia/Kolkata',
  	"sent_at" timestamp(3) with time zone,
  	"sentat_tz" "enum_newsletter_issues_sentat_tz" DEFAULT 'Asia/Kolkata',
  	"recipient_count" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_jobs_stats" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"stats" jsonb,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "people" ADD COLUMN "whatsapp_last_inbound_at" timestamp(3) with time zone;
  ALTER TABLE "people" ADD COLUMN "whatsapplastinboundat_tz" "enum_people_whatsapplastinboundat_tz" DEFAULT 'Asia/Kolkata';
  ALTER TABLE "payments" ADD COLUMN "link_url" varchar;
  ALTER TABLE "payload_jobs" ADD COLUMN "concurrency_key" varchar;
  ALTER TABLE "payload_jobs" ADD COLUMN "meta" jsonb;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "message_templates_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "automations_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "suppressions_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "subscribers_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "newsletter_issues_id" integer;
  ALTER TABLE "messages" ADD CONSTRAINT "messages_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "messages" ADD CONSTRAINT "messages_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "messages" ADD CONSTRAINT "messages_staff_id_users_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "messages" ADD CONSTRAINT "messages_fallback_of_id_messages_id_fk" FOREIGN KEY ("fallback_of_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_message_templates_v" ADD CONSTRAINT "_message_templates_v_parent_id_message_templates_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."message_templates"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_message_templates_v" ADD CONSTRAINT "_message_templates_v_version_owner_id_users_id_fk" FOREIGN KEY ("version_owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "suppressions" ADD CONSTRAINT "suppressions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_notice_id_consent_versions_id_fk" FOREIGN KEY ("notice_id") REFERENCES "public"."consent_versions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "subscribers" ADD CONSTRAINT "subscribers_consent_id_consents_id_fk" FOREIGN KEY ("consent_id") REFERENCES "public"."consents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "newsletter_issues_items" ADD CONSTRAINT "newsletter_issues_items_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "newsletter_issues_items" ADD CONSTRAINT "newsletter_issues_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."newsletter_issues"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "newsletter_issues" ADD CONSTRAINT "newsletter_issues_lead_post_id_posts_id_fk" FOREIGN KEY ("lead_post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "messages_dedupe_key_idx" ON "messages" USING btree ("dedupe_key");
  CREATE INDEX "messages_automation_idx" ON "messages" USING btree ("automation");
  CREATE INDEX "messages_status_idx" ON "messages" USING btree ("status");
  CREATE INDEX "messages_person_idx" ON "messages" USING btree ("person_id");
  CREATE INDEX "messages_subscriber_idx" ON "messages" USING btree ("subscriber_id");
  CREATE INDEX "messages_staff_idx" ON "messages" USING btree ("staff_id");
  CREATE INDEX "messages_fallback_of_idx" ON "messages" USING btree ("fallback_of_id");
  CREATE INDEX "messages_send_at_idx" ON "messages" USING btree ("send_at");
  CREATE UNIQUE INDEX "messages_provider_message_id_idx" ON "messages" USING btree ("provider_message_id");
  CREATE INDEX "messages_updated_at_idx" ON "messages" USING btree ("updated_at");
  CREATE INDEX "messages_created_at_idx" ON "messages" USING btree ("created_at");
  CREATE INDEX "status_sendAt_idx" ON "messages" USING btree ("status","send_at");
  CREATE INDEX "subjectCollection_subjectId_idx" ON "messages" USING btree ("subject_collection","subject_id");
  CREATE INDEX "message_templates_owner_idx" ON "message_templates" USING btree ("owner_id");
  CREATE INDEX "message_templates_updated_at_idx" ON "message_templates" USING btree ("updated_at");
  CREATE INDEX "message_templates_created_at_idx" ON "message_templates" USING btree ("created_at");
  CREATE UNIQUE INDEX "key_channel_language_idx" ON "message_templates" USING btree ("key","channel","language");
  CREATE INDEX "_message_templates_v_parent_idx" ON "_message_templates_v" USING btree ("parent_id");
  CREATE INDEX "_message_templates_v_version_version_owner_idx" ON "_message_templates_v" USING btree ("version_owner_id");
  CREATE INDEX "_message_templates_v_version_version_updated_at_idx" ON "_message_templates_v" USING btree ("version_updated_at");
  CREATE INDEX "_message_templates_v_version_version_created_at_idx" ON "_message_templates_v" USING btree ("version_created_at");
  CREATE INDEX "_message_templates_v_created_at_idx" ON "_message_templates_v" USING btree ("created_at");
  CREATE INDEX "_message_templates_v_updated_at_idx" ON "_message_templates_v" USING btree ("updated_at");
  CREATE INDEX "version_key_version_channel_version_language_idx" ON "_message_templates_v" USING btree ("version_key","version_channel","version_language");
  CREATE UNIQUE INDEX "automations_key_idx" ON "automations" USING btree ("key");
  CREATE INDEX "automations_updated_at_idx" ON "automations" USING btree ("updated_at");
  CREATE INDEX "automations_created_at_idx" ON "automations" USING btree ("created_at");
  CREATE INDEX "suppressions_person_idx" ON "suppressions" USING btree ("person_id");
  CREATE INDEX "suppressions_updated_at_idx" ON "suppressions" USING btree ("updated_at");
  CREATE INDEX "suppressions_created_at_idx" ON "suppressions" USING btree ("created_at");
  CREATE UNIQUE INDEX "channel_address_idx" ON "suppressions" USING btree ("channel","address");
  CREATE UNIQUE INDEX "subscribers_email_idx" ON "subscribers" USING btree ("email");
  CREATE INDEX "subscribers_status_idx" ON "subscribers" USING btree ("status");
  CREATE INDEX "subscribers_notice_idx" ON "subscribers" USING btree ("notice_id");
  CREATE INDEX "subscribers_person_idx" ON "subscribers" USING btree ("person_id");
  CREATE INDEX "subscribers_consent_idx" ON "subscribers" USING btree ("consent_id");
  CREATE INDEX "subscribers_confirm_token_hash_idx" ON "subscribers" USING btree ("confirm_token_hash");
  CREATE INDEX "subscribers_updated_at_idx" ON "subscribers" USING btree ("updated_at");
  CREATE INDEX "subscribers_created_at_idx" ON "subscribers" USING btree ("created_at");
  CREATE INDEX "newsletter_issues_items_order_idx" ON "newsletter_issues_items" USING btree ("_order");
  CREATE INDEX "newsletter_issues_items_parent_id_idx" ON "newsletter_issues_items" USING btree ("_parent_id");
  CREATE INDEX "newsletter_issues_items_post_idx" ON "newsletter_issues_items" USING btree ("post_id");
  CREATE UNIQUE INDEX "newsletter_issues_number_idx" ON "newsletter_issues" USING btree ("number");
  CREATE INDEX "newsletter_issues_lead_lead_post_idx" ON "newsletter_issues" USING btree ("lead_post_id");
  CREATE INDEX "newsletter_issues_updated_at_idx" ON "newsletter_issues" USING btree ("updated_at");
  CREATE INDEX "newsletter_issues_created_at_idx" ON "newsletter_issues" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_message_templates_fk" FOREIGN KEY ("message_templates_id") REFERENCES "public"."message_templates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_automations_fk" FOREIGN KEY ("automations_id") REFERENCES "public"."automations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_suppressions_fk" FOREIGN KEY ("suppressions_id") REFERENCES "public"."suppressions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_subscribers_fk" FOREIGN KEY ("subscribers_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_newsletter_issues_fk" FOREIGN KEY ("newsletter_issues_id") REFERENCES "public"."newsletter_issues"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_jobs_concurrency_key_idx" ON "payload_jobs" USING btree ("concurrency_key");
  CREATE INDEX "payload_locked_documents_rels_message_templates_id_idx" ON "payload_locked_documents_rels" USING btree ("message_templates_id");
  CREATE INDEX "payload_locked_documents_rels_automations_id_idx" ON "payload_locked_documents_rels" USING btree ("automations_id");
  CREATE INDEX "payload_locked_documents_rels_suppressions_id_idx" ON "payload_locked_documents_rels" USING btree ("suppressions_id");
  CREATE INDEX "payload_locked_documents_rels_subscribers_id_idx" ON "payload_locked_documents_rels" USING btree ("subscribers_id");
  CREATE INDEX "payload_locked_documents_rels_newsletter_issues_id_idx" ON "payload_locked_documents_rels" USING btree ("newsletter_issues_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "messages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "message_templates" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_message_templates_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "automations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "suppressions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "subscribers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "newsletter_issues_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "newsletter_issues" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_jobs_stats" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "messages" CASCADE;
  DROP TABLE "message_templates" CASCADE;
  DROP TABLE "_message_templates_v" CASCADE;
  DROP TABLE "automations" CASCADE;
  DROP TABLE "suppressions" CASCADE;
  DROP TABLE "subscribers" CASCADE;
  DROP TABLE "newsletter_issues_items" CASCADE;
  DROP TABLE "newsletter_issues" CASCADE;
  DROP TABLE "payload_jobs_stats" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_message_templates_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_automations_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_suppressions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_subscribers_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_newsletter_issues_fk";
  
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'O5-purge-missing-pages', 'B4-expire-holds', 'B2-poll-pending-orders', 'B11-reconcile', 'B2-B7-sync-calendar-event', 'B14-refresh-busy-times', 'B3-issue-invoice', 'B7-issue-credit-note', 'P2-lead-from-call', 'P3-P4-lead-alerts', 'P8-expire-proposals');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'O5-purge-missing-pages', 'B4-expire-holds', 'B2-poll-pending-orders', 'B11-reconcile', 'B2-B7-sync-calendar-event', 'B14-refresh-busy-times', 'B3-issue-invoice', 'B7-issue-credit-note', 'P2-lead-from-call', 'P3-P4-lead-alerts', 'P8-expire-proposals');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "payload_jobs_concurrency_key_idx";
  DROP INDEX "payload_locked_documents_rels_message_templates_id_idx";
  DROP INDEX "payload_locked_documents_rels_automations_id_idx";
  DROP INDEX "payload_locked_documents_rels_suppressions_id_idx";
  DROP INDEX "payload_locked_documents_rels_subscribers_id_idx";
  DROP INDEX "payload_locked_documents_rels_newsletter_issues_id_idx";
  ALTER TABLE "people" DROP COLUMN "whatsapp_last_inbound_at";
  ALTER TABLE "people" DROP COLUMN "whatsapplastinboundat_tz";
  ALTER TABLE "payments" DROP COLUMN "link_url";
  ALTER TABLE "payload_jobs" DROP COLUMN "concurrency_key";
  ALTER TABLE "payload_jobs" DROP COLUMN "meta";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "message_templates_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "automations_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "suppressions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "subscribers_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "newsletter_issues_id";
  DROP TYPE "public"."enum_people_whatsapplastinboundat_tz";
  DROP TYPE "public"."enum_messages_automation";
  DROP TYPE "public"."enum_messages_template";
  DROP TYPE "public"."enum_messages_channel";
  DROP TYPE "public"."enum_messages_fallback";
  DROP TYPE "public"."enum_messages_kind";
  DROP TYPE "public"."enum_messages_sender";
  DROP TYPE "public"."enum_messages_status";
  DROP TYPE "public"."enum_messages_skip_reason";
  DROP TYPE "public"."enum_messages_recipient_kind";
  DROP TYPE "public"."enum_messages_subject_collection";
  DROP TYPE "public"."enum_messages_sendat_tz";
  DROP TYPE "public"."enum_messages_sendbefore_tz";
  DROP TYPE "public"."enum_messages_claimedat_tz";
  DROP TYPE "public"."enum_messages_sentat_tz";
  DROP TYPE "public"."enum_messages_deliveredat_tz";
  DROP TYPE "public"."enum_messages_readat_tz";
  DROP TYPE "public"."enum_messages_provider";
  DROP TYPE "public"."enum_message_templates_key";
  DROP TYPE "public"."enum_message_templates_channel";
  DROP TYPE "public"."enum_message_templates_language";
  DROP TYPE "public"."enum_message_templates_category";
  DROP TYPE "public"."enum_message_templates_status";
  DROP TYPE "public"."enum_message_templates_lastreviewedat_tz";
  DROP TYPE "public"."enum__message_templates_v_version_key";
  DROP TYPE "public"."enum__message_templates_v_version_channel";
  DROP TYPE "public"."enum__message_templates_v_version_language";
  DROP TYPE "public"."enum__message_templates_v_version_category";
  DROP TYPE "public"."enum__message_templates_v_version_status";
  DROP TYPE "public"."enum__message_templates_v_version_lastreviewedat_tz";
  DROP TYPE "public"."enum_automations_key";
  DROP TYPE "public"."enum_automations_lastrunat_tz";
  DROP TYPE "public"."enum_suppressions_channel";
  DROP TYPE "public"."enum_suppressions_reason";
  DROP TYPE "public"."enum_suppressions_at_tz";
  DROP TYPE "public"."enum_suppressions_source";
  DROP TYPE "public"."enum_subscribers_status";
  DROP TYPE "public"."enum_subscribers_confirmexpiresat_tz";
  DROP TYPE "public"."enum_subscribers_confirmedat_tz";
  DROP TYPE "public"."enum_subscribers_unsubscribedat_tz";
  DROP TYPE "public"."enum_subscribers_lastengagedat_tz";
  DROP TYPE "public"."enum_newsletter_issues_status";
  DROP TYPE "public"."enum_newsletter_issues_scheduledfor_tz";
  DROP TYPE "public"."enum_newsletter_issues_sentat_tz";`)
}
