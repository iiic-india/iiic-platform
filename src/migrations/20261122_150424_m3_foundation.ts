import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_bookings_type" AS ENUM('session', 'call', 'info');
  CREATE TYPE "public"."enum_bookings_status" AS ENUM('requested', 'held', 'pendingPayment', 'confirmed', 'completed', 'noShow', 'cancelledByClient', 'cancelledByIiic', 'rescheduled', 'expired');
  CREATE TYPE "public"."enum_bookings_payment_status" AS ENUM('notRequired', 'unpaid', 'linkSent', 'paid', 'partRefunded', 'refunded');
  CREATE TYPE "public"."enum_bookings_who_for" AS ENUM('yourself', 'family', 'organisation');
  CREATE TYPE "public"."enum_bookings_age_band" AS ENUM('under18', 'adult');
  CREATE TYPE "public"."enum_bookings_format" AS ENUM('online', 'office');
  CREATE TYPE "public"."enum_bookings_startsat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_bookings_endsat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_bookings_holdexpiresat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_bookings_confirmedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_bookings_cancellation_at_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_events_kind" AS ENUM('infoSession', 'cohortSession', 'workshop');
  CREATE TYPE "public"."enum_events_startsat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_events_endsat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_events_format" AS ENUM('online', 'office');
  CREATE TYPE "public"."enum_availability_rules_weekday" AS ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');
  CREATE TYPE "public"."enum_availability_exceptions_kind" AS ENUM('closed', 'customHours');
  CREATE TYPE "public"."enum_calendar_connections_provider" AS ENUM('google');
  CREATE TYPE "public"."enum_calendar_connections_status" AS ENUM('paused', 'connected', 'failing');
  CREATE TYPE "public"."enum_calendar_connections_lastsyncedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_calendar_connections_watch_expiresat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_busy_blocks_startsat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_busy_blocks_endsat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_busy_blocks_source" AS ENUM('google');
  CREATE TYPE "public"."enum_price_history_validfrom_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_price_history_validto_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_payments_kind" AS ENUM('checkout', 'paymentLink');
  CREATE TYPE "public"."enum_payments_gateway" AS ENUM('razorpay');
  CREATE TYPE "public"."enum_payments_status" AS ENUM('created', 'authorized', 'captured', 'failed', 'expired', 'cancelled', 'partRefunded', 'refunded');
  CREATE TYPE "public"."enum_payments_currency" AS ENUM('INR');
  CREATE TYPE "public"."enum_payments_capturedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_payments_linksentat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_payments_expiresat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_gateway_events_gateway" AS ENUM('razorpay');
  CREATE TYPE "public"."enum_gateway_events_source" AS ENUM('webhook', 'poll', 'reconciliation');
  CREATE TYPE "public"."enum_gateway_events_receivedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_gateway_events_outcome" AS ENUM('processed', 'ignored', 'flagged');
  CREATE TYPE "public"."enum_refunds_status" AS ENUM('requested', 'awaitingApproval', 'approved', 'declined', 'processing', 'processed', 'failed');
  CREATE TYPE "public"."enum_refunds_reason" AS ENUM('cancelledByClient', 'cancelledByIiic', 'slotTaken', 'other');
  CREATE TYPE "public"."enum_refunds_decidedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_refunds_processedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_invoices_kind" AS ENUM('taxInvoice', 'receiptVoucher', 'refundVoucher', 'creditNote');
  CREATE TYPE "public"."enum_invoices_status" AS ENUM('pending', 'issued', 'failed', 'void');
  CREATE TYPE "public"."enum_invoices_issuedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TABLE "bookings_time_request_preferred_days" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"day" varchar
  );
  
  CREATE TABLE "bookings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"reference" varchar NOT NULL,
  	"type" "enum_bookings_type" NOT NULL,
  	"status" "enum_bookings_status" NOT NULL,
  	"payment_status" "enum_bookings_payment_status" DEFAULT 'notRequired' NOT NULL,
  	"service_id" integer NOT NULL,
  	"service_option" varchar,
  	"option_label" varchar,
  	"duration_minutes" numeric,
  	"practitioner_id" integer,
  	"event_id" integer,
  	"person_id" integer NOT NULL,
  	"booked_by_id" integer,
  	"who_for" "enum_bookings_who_for",
  	"age_band" "enum_bookings_age_band",
  	"format" "enum_bookings_format",
  	"starts_at" timestamp(3) with time zone,
  	"startsat_tz" "enum_bookings_startsat_tz" DEFAULT 'Asia/Kolkata',
  	"ends_at" timestamp(3) with time zone,
  	"endsat_tz" "enum_bookings_endsat_tz" DEFAULT 'Asia/Kolkata',
  	"hold_expires_at" timestamp(3) with time zone,
  	"holdexpiresat_tz" "enum_bookings_holdexpiresat_tz" DEFAULT 'Asia/Kolkata',
  	"time_request_preferred_times" varchar,
  	"time_request_note" varchar,
  	"meeting_url" varchar,
  	"calendar_event_id" varchar,
  	"price_total_paise" numeric,
  	"price_tax_paise" numeric,
  	"price_gst_rate_basis_points" numeric,
  	"price_sac_code" varchar,
  	"rescheduled_from_id" integer,
  	"confirmed_at" timestamp(3) with time zone,
  	"confirmedat_tz" "enum_bookings_confirmedat_tz" DEFAULT 'Asia/Kolkata',
  	"cancellation_at" timestamp(3) with time zone,
  	"cancellation_at_tz" "enum_bookings_cancellation_at_tz" DEFAULT 'Asia/Kolkata',
  	"cancellation_reason" varchar,
  	"company_name" varchar,
  	"company_role" varchar,
  	"company_team_size" varchar,
  	"company_sector" varchar,
  	"source" varchar,
  	"utm_source" varchar,
  	"utm_medium" varchar,
  	"utm_campaign" varchar,
  	"utm_term" varchar,
  	"utm_content" varchar,
  	"manage_token_hash" varchar,
  	"checkout_key" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "bookings_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"consents_id" integer
  );
  
  CREATE TABLE "events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"kind" "enum_events_kind" DEFAULT 'infoSession' NOT NULL,
  	"service_id" integer,
  	"practitioner_id" integer,
  	"starts_at" timestamp(3) with time zone NOT NULL,
  	"startsat_tz" "enum_events_startsat_tz" DEFAULT 'Asia/Kolkata' NOT NULL,
  	"ends_at" timestamp(3) with time zone NOT NULL,
  	"endsat_tz" "enum_events_endsat_tz" DEFAULT 'Asia/Kolkata' NOT NULL,
  	"format" "enum_events_format" NOT NULL,
  	"capacity" numeric,
  	"join_link" varchar,
  	"active" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "availability_rules_spans" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"start" varchar NOT NULL,
  	"end" varchar NOT NULL
  );
  
  CREATE TABLE "availability_rules" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"practitioner_id" integer NOT NULL,
  	"weekday" "enum_availability_rules_weekday" NOT NULL,
  	"valid_from" varchar NOT NULL,
  	"valid_to" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "availability_exceptions_spans" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"start" varchar,
  	"end" varchar
  );
  
  CREATE TABLE "availability_exceptions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"practitioner_id" integer NOT NULL,
  	"day" varchar NOT NULL,
  	"kind" "enum_availability_exceptions_kind" DEFAULT 'closed' NOT NULL,
  	"reason" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "calendar_connections" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"practitioner_id" integer NOT NULL,
  	"provider" "enum_calendar_connections_provider" DEFAULT 'google' NOT NULL,
  	"calendar_id" varchar NOT NULL,
  	"status" "enum_calendar_connections_status" DEFAULT 'paused' NOT NULL,
  	"last_synced_at" timestamp(3) with time zone,
  	"lastsyncedat_tz" "enum_calendar_connections_lastsyncedat_tz" DEFAULT 'Asia/Kolkata',
  	"last_error" varchar,
  	"watch_channel_id" varchar,
  	"watch_resource_id" varchar,
  	"watch_expires_at" timestamp(3) with time zone,
  	"watch_expiresat_tz" "enum_calendar_connections_watch_expiresat_tz" DEFAULT 'Asia/Kolkata',
  	"channel_token_hash" varchar,
  	"feed_token_hash" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "busy_blocks" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"practitioner_id" integer NOT NULL,
  	"starts_at" timestamp(3) with time zone NOT NULL,
  	"startsat_tz" "enum_busy_blocks_startsat_tz" DEFAULT 'Asia/Kolkata' NOT NULL,
  	"ends_at" timestamp(3) with time zone NOT NULL,
  	"endsat_tz" "enum_busy_blocks_endsat_tz" DEFAULT 'Asia/Kolkata' NOT NULL,
  	"source" "enum_busy_blocks_source" DEFAULT 'google' NOT NULL
  );
  
  CREATE TABLE "price_history" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"service_id" integer NOT NULL,
  	"service_option" varchar NOT NULL,
  	"option_label" varchar,
  	"duration_minutes" numeric,
  	"price_paise" numeric NOT NULL,
  	"gst_inclusive" boolean,
  	"gst_rate_basis_points" numeric,
  	"valid_from" timestamp(3) with time zone NOT NULL,
  	"validfrom_tz" "enum_price_history_validfrom_tz" DEFAULT 'Asia/Kolkata' NOT NULL,
  	"valid_to" timestamp(3) with time zone,
  	"validto_tz" "enum_price_history_validto_tz" DEFAULT 'Asia/Kolkata'
  );
  
  CREATE TABLE "payments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"booking_id" integer NOT NULL,
  	"kind" "enum_payments_kind" NOT NULL,
  	"gateway" "enum_payments_gateway" DEFAULT 'razorpay' NOT NULL,
  	"status" "enum_payments_status" DEFAULT 'created' NOT NULL,
  	"amount_paise" numeric NOT NULL,
  	"currency" "enum_payments_currency" DEFAULT 'INR' NOT NULL,
  	"refunded_paise" numeric DEFAULT 0,
  	"receipt" varchar NOT NULL,
  	"gateway_order_id" varchar,
  	"gateway_payment_link_id" varchar,
  	"gateway_payment_id" varchar,
  	"method" varchar,
  	"failure_code" varchar,
  	"captured_at" timestamp(3) with time zone,
  	"capturedat_tz" "enum_payments_capturedat_tz" DEFAULT 'Asia/Kolkata',
  	"link_sent_at" timestamp(3) with time zone,
  	"linksentat_tz" "enum_payments_linksentat_tz" DEFAULT 'Asia/Kolkata',
  	"expires_at" timestamp(3) with time zone,
  	"expiresat_tz" "enum_payments_expiresat_tz" DEFAULT 'Asia/Kolkata',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "gateway_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"gateway" "enum_gateway_events_gateway" DEFAULT 'razorpay' NOT NULL,
  	"event_id" varchar NOT NULL,
  	"type" varchar NOT NULL,
  	"source" "enum_gateway_events_source" NOT NULL,
  	"gateway_order_id" varchar,
  	"gateway_payment_link_id" varchar,
  	"gateway_payment_id" varchar,
  	"gateway_refund_id" varchar,
  	"amount_paise" numeric,
  	"payment_id" integer,
  	"refund_id" integer,
  	"received_at" timestamp(3) with time zone NOT NULL,
  	"receivedat_tz" "enum_gateway_events_receivedat_tz" DEFAULT 'Asia/Kolkata' NOT NULL,
  	"outcome" "enum_gateway_events_outcome" NOT NULL,
  	"note" varchar
  );
  
  CREATE TABLE "refunds" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"payment_id" integer NOT NULL,
  	"booking_id" integer,
  	"status" "enum_refunds_status" DEFAULT 'requested' NOT NULL,
  	"amount_paise" numeric NOT NULL,
  	"reason" "enum_refunds_reason" NOT NULL,
  	"reason_note" varchar,
  	"payer_instruction" varchar,
  	"requested_by_id" integer,
  	"approved_by_id" integer,
  	"decided_at" timestamp(3) with time zone,
  	"decidedat_tz" "enum_refunds_decidedat_tz" DEFAULT 'Asia/Kolkata',
  	"gateway_refund_id" varchar,
  	"processed_at" timestamp(3) with time zone,
  	"processedat_tz" "enum_refunds_processedat_tz" DEFAULT 'Asia/Kolkata',
  	"failure_code" varchar,
  	"idempotency_key" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "invoices_lines" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"description" varchar NOT NULL,
  	"sac_code" varchar,
  	"quantity" numeric DEFAULT 1 NOT NULL,
  	"gst_rate_basis_points" numeric,
  	"taxable_paise" numeric,
  	"cgst_paise" numeric,
  	"sgst_paise" numeric,
  	"igst_paise" numeric,
  	"total_paise" numeric
  );
  
  CREATE TABLE "invoices" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"kind" "enum_invoices_kind" NOT NULL,
  	"status" "enum_invoices_status" DEFAULT 'pending' NOT NULL,
  	"number" varchar,
  	"zoho_id" varchar,
  	"booking_id" integer,
  	"payment_id" integer,
  	"refund_id" integer,
  	"against_id" integer,
  	"buyer_name" varchar,
  	"buyer_gstin" varchar,
  	"buyer_state_code" varchar,
  	"buyer_address" varchar,
  	"totals_taxable_paise" numeric,
  	"totals_cgst_paise" numeric,
  	"totals_sgst_paise" numeric,
  	"totals_igst_paise" numeric,
  	"totals_total_paise" numeric,
  	"issued_at" timestamp(3) with time zone,
  	"issuedat_tz" "enum_invoices_issuedat_tz" DEFAULT 'Asia/Kolkata',
  	"pdf_key" varchar,
  	"failure_code" varchar,
  	"idempotency_key" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "services" ADD COLUMN "gst_rate_basis_points" numeric;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "bookings_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "events_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "availability_rules_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "availability_exceptions_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "calendar_connections_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "price_history_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "payments_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "refunds_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "invoices_id" integer;
  ALTER TABLE "settings" ADD COLUMN "money_refund_approval_threshold_paise" numeric;
  ALTER TABLE "bookings_time_request_preferred_days" ADD CONSTRAINT "bookings_time_request_preferred_days_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_booked_by_id_people_id_fk" FOREIGN KEY ("booked_by_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_rescheduled_from_id_bookings_id_fk" FOREIGN KEY ("rescheduled_from_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bookings_rels" ADD CONSTRAINT "bookings_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "bookings_rels" ADD CONSTRAINT "bookings_rels_consents_fk" FOREIGN KEY ("consents_id") REFERENCES "public"."consents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "events" ADD CONSTRAINT "events_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "events" ADD CONSTRAINT "events_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "availability_rules_spans" ADD CONSTRAINT "availability_rules_spans_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."availability_rules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "availability_exceptions_spans" ADD CONSTRAINT "availability_exceptions_spans_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."availability_exceptions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "busy_blocks" ADD CONSTRAINT "busy_blocks_practitioner_id_practitioners_id_fk" FOREIGN KEY ("practitioner_id") REFERENCES "public"."practitioners"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "price_history" ADD CONSTRAINT "price_history_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "gateway_events" ADD CONSTRAINT "gateway_events_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "gateway_events" ADD CONSTRAINT "gateway_events_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "refunds" ADD CONSTRAINT "refunds_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "invoices_lines" ADD CONSTRAINT "invoices_lines_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "invoices" ADD CONSTRAINT "invoices_against_id_invoices_id_fk" FOREIGN KEY ("against_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "bookings_time_request_preferred_days_order_idx" ON "bookings_time_request_preferred_days" USING btree ("_order");
  CREATE INDEX "bookings_time_request_preferred_days_parent_id_idx" ON "bookings_time_request_preferred_days" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "bookings_reference_idx" ON "bookings" USING btree ("reference");
  CREATE INDEX "bookings_type_idx" ON "bookings" USING btree ("type");
  CREATE INDEX "bookings_status_idx" ON "bookings" USING btree ("status");
  CREATE INDEX "bookings_service_idx" ON "bookings" USING btree ("service_id");
  CREATE INDEX "bookings_practitioner_idx" ON "bookings" USING btree ("practitioner_id");
  CREATE INDEX "bookings_event_idx" ON "bookings" USING btree ("event_id");
  CREATE INDEX "bookings_person_idx" ON "bookings" USING btree ("person_id");
  CREATE INDEX "bookings_booked_by_idx" ON "bookings" USING btree ("booked_by_id");
  CREATE INDEX "bookings_starts_at_idx" ON "bookings" USING btree ("starts_at");
  CREATE INDEX "bookings_rescheduled_from_idx" ON "bookings" USING btree ("rescheduled_from_id");
  CREATE UNIQUE INDEX "bookings_manage_token_hash_idx" ON "bookings" USING btree ("manage_token_hash");
  CREATE UNIQUE INDEX "bookings_checkout_key_idx" ON "bookings" USING btree ("checkout_key");
  CREATE INDEX "bookings_updated_at_idx" ON "bookings" USING btree ("updated_at");
  CREATE INDEX "bookings_created_at_idx" ON "bookings" USING btree ("created_at");
  CREATE INDEX "practitioner_startsAt_idx" ON "bookings" USING btree ("practitioner_id","starts_at");
  CREATE INDEX "status_holdExpiresAt_idx" ON "bookings" USING btree ("status","hold_expires_at");
  CREATE INDEX "bookings_rels_order_idx" ON "bookings_rels" USING btree ("order");
  CREATE INDEX "bookings_rels_parent_idx" ON "bookings_rels" USING btree ("parent_id");
  CREATE INDEX "bookings_rels_path_idx" ON "bookings_rels" USING btree ("path");
  CREATE INDEX "bookings_rels_consents_id_idx" ON "bookings_rels" USING btree ("consents_id");
  CREATE INDEX "events_service_idx" ON "events" USING btree ("service_id");
  CREATE INDEX "events_practitioner_idx" ON "events" USING btree ("practitioner_id");
  CREATE INDEX "events_starts_at_idx" ON "events" USING btree ("starts_at");
  CREATE INDEX "events_active_idx" ON "events" USING btree ("active");
  CREATE INDEX "events_updated_at_idx" ON "events" USING btree ("updated_at");
  CREATE INDEX "events_created_at_idx" ON "events" USING btree ("created_at");
  CREATE INDEX "availability_rules_spans_order_idx" ON "availability_rules_spans" USING btree ("_order");
  CREATE INDEX "availability_rules_spans_parent_id_idx" ON "availability_rules_spans" USING btree ("_parent_id");
  CREATE INDEX "availability_rules_practitioner_idx" ON "availability_rules" USING btree ("practitioner_id");
  CREATE INDEX "availability_rules_updated_at_idx" ON "availability_rules" USING btree ("updated_at");
  CREATE INDEX "availability_rules_created_at_idx" ON "availability_rules" USING btree ("created_at");
  CREATE INDEX "practitioner_weekday_idx" ON "availability_rules" USING btree ("practitioner_id","weekday");
  CREATE INDEX "availability_exceptions_spans_order_idx" ON "availability_exceptions_spans" USING btree ("_order");
  CREATE INDEX "availability_exceptions_spans_parent_id_idx" ON "availability_exceptions_spans" USING btree ("_parent_id");
  CREATE INDEX "availability_exceptions_practitioner_idx" ON "availability_exceptions" USING btree ("practitioner_id");
  CREATE INDEX "availability_exceptions_updated_at_idx" ON "availability_exceptions" USING btree ("updated_at");
  CREATE INDEX "availability_exceptions_created_at_idx" ON "availability_exceptions" USING btree ("created_at");
  CREATE UNIQUE INDEX "practitioner_day_idx" ON "availability_exceptions" USING btree ("practitioner_id","day");
  CREATE UNIQUE INDEX "calendar_connections_practitioner_idx" ON "calendar_connections" USING btree ("practitioner_id");
  CREATE UNIQUE INDEX "calendar_connections_watch_watch_channel_id_idx" ON "calendar_connections" USING btree ("watch_channel_id");
  CREATE UNIQUE INDEX "calendar_connections_feed_token_hash_idx" ON "calendar_connections" USING btree ("feed_token_hash");
  CREATE INDEX "calendar_connections_updated_at_idx" ON "calendar_connections" USING btree ("updated_at");
  CREATE INDEX "calendar_connections_created_at_idx" ON "calendar_connections" USING btree ("created_at");
  CREATE INDEX "busy_blocks_practitioner_idx" ON "busy_blocks" USING btree ("practitioner_id");
  CREATE INDEX "practitioner_startsAt_1_idx" ON "busy_blocks" USING btree ("practitioner_id","starts_at");
  CREATE INDEX "price_history_service_idx" ON "price_history" USING btree ("service_id");
  CREATE UNIQUE INDEX "service_serviceOption_validFrom_idx" ON "price_history" USING btree ("service_id","service_option","valid_from");
  CREATE INDEX "payments_booking_idx" ON "payments" USING btree ("booking_id");
  CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");
  CREATE UNIQUE INDEX "payments_receipt_idx" ON "payments" USING btree ("receipt");
  CREATE UNIQUE INDEX "payments_gateway_order_id_idx" ON "payments" USING btree ("gateway_order_id");
  CREATE UNIQUE INDEX "payments_gateway_payment_link_id_idx" ON "payments" USING btree ("gateway_payment_link_id");
  CREATE UNIQUE INDEX "payments_gateway_payment_id_idx" ON "payments" USING btree ("gateway_payment_id");
  CREATE INDEX "payments_updated_at_idx" ON "payments" USING btree ("updated_at");
  CREATE INDEX "payments_created_at_idx" ON "payments" USING btree ("created_at");
  CREATE INDEX "gateway_events_gateway_order_id_idx" ON "gateway_events" USING btree ("gateway_order_id");
  CREATE INDEX "gateway_events_gateway_payment_link_id_idx" ON "gateway_events" USING btree ("gateway_payment_link_id");
  CREATE INDEX "gateway_events_gateway_payment_id_idx" ON "gateway_events" USING btree ("gateway_payment_id");
  CREATE INDEX "gateway_events_gateway_refund_id_idx" ON "gateway_events" USING btree ("gateway_refund_id");
  CREATE INDEX "gateway_events_payment_idx" ON "gateway_events" USING btree ("payment_id");
  CREATE INDEX "gateway_events_refund_idx" ON "gateway_events" USING btree ("refund_id");
  CREATE INDEX "gateway_events_received_at_idx" ON "gateway_events" USING btree ("received_at");
  CREATE UNIQUE INDEX "gateway_eventId_idx" ON "gateway_events" USING btree ("gateway","event_id");
  CREATE INDEX "refunds_payment_idx" ON "refunds" USING btree ("payment_id");
  CREATE INDEX "refunds_booking_idx" ON "refunds" USING btree ("booking_id");
  CREATE INDEX "refunds_status_idx" ON "refunds" USING btree ("status");
  CREATE INDEX "refunds_requested_by_idx" ON "refunds" USING btree ("requested_by_id");
  CREATE INDEX "refunds_approved_by_idx" ON "refunds" USING btree ("approved_by_id");
  CREATE UNIQUE INDEX "refunds_gateway_refund_id_idx" ON "refunds" USING btree ("gateway_refund_id");
  CREATE UNIQUE INDEX "refunds_idempotency_key_idx" ON "refunds" USING btree ("idempotency_key");
  CREATE INDEX "refunds_updated_at_idx" ON "refunds" USING btree ("updated_at");
  CREATE INDEX "refunds_created_at_idx" ON "refunds" USING btree ("created_at");
  CREATE INDEX "invoices_lines_order_idx" ON "invoices_lines" USING btree ("_order");
  CREATE INDEX "invoices_lines_parent_id_idx" ON "invoices_lines" USING btree ("_parent_id");
  CREATE INDEX "invoices_status_idx" ON "invoices" USING btree ("status");
  CREATE INDEX "invoices_number_idx" ON "invoices" USING btree ("number");
  CREATE UNIQUE INDEX "invoices_zoho_id_idx" ON "invoices" USING btree ("zoho_id");
  CREATE INDEX "invoices_booking_idx" ON "invoices" USING btree ("booking_id");
  CREATE INDEX "invoices_payment_idx" ON "invoices" USING btree ("payment_id");
  CREATE INDEX "invoices_refund_idx" ON "invoices" USING btree ("refund_id");
  CREATE INDEX "invoices_against_idx" ON "invoices" USING btree ("against_id");
  CREATE UNIQUE INDEX "invoices_idempotency_key_idx" ON "invoices" USING btree ("idempotency_key");
  CREATE INDEX "invoices_updated_at_idx" ON "invoices" USING btree ("updated_at");
  CREATE INDEX "invoices_created_at_idx" ON "invoices" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_bookings_fk" FOREIGN KEY ("bookings_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_events_fk" FOREIGN KEY ("events_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_availability_rules_fk" FOREIGN KEY ("availability_rules_id") REFERENCES "public"."availability_rules"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_availability_exceptions_fk" FOREIGN KEY ("availability_exceptions_id") REFERENCES "public"."availability_exceptions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_calendar_connections_fk" FOREIGN KEY ("calendar_connections_id") REFERENCES "public"."calendar_connections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_price_history_fk" FOREIGN KEY ("price_history_id") REFERENCES "public"."price_history"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payments_fk" FOREIGN KEY ("payments_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_refunds_fk" FOREIGN KEY ("refunds_id") REFERENCES "public"."refunds"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_invoices_fk" FOREIGN KEY ("invoices_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_bookings_id_idx" ON "payload_locked_documents_rels" USING btree ("bookings_id");
  CREATE INDEX "payload_locked_documents_rels_events_id_idx" ON "payload_locked_documents_rels" USING btree ("events_id");
  CREATE INDEX "payload_locked_documents_rels_availability_rules_id_idx" ON "payload_locked_documents_rels" USING btree ("availability_rules_id");
  CREATE INDEX "payload_locked_documents_rels_availability_exceptions_id_idx" ON "payload_locked_documents_rels" USING btree ("availability_exceptions_id");
  CREATE INDEX "payload_locked_documents_rels_calendar_connections_id_idx" ON "payload_locked_documents_rels" USING btree ("calendar_connections_id");
  CREATE INDEX "payload_locked_documents_rels_price_history_id_idx" ON "payload_locked_documents_rels" USING btree ("price_history_id");
  CREATE INDEX "payload_locked_documents_rels_payments_id_idx" ON "payload_locked_documents_rels" USING btree ("payments_id");
  CREATE INDEX "payload_locked_documents_rels_refunds_id_idx" ON "payload_locked_documents_rels" USING btree ("refunds_id");
  CREATE INDEX "payload_locked_documents_rels_invoices_id_idx" ON "payload_locked_documents_rels" USING btree ("invoices_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "bookings_time_request_preferred_days" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "bookings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "bookings_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "availability_rules_spans" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "availability_rules" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "availability_exceptions_spans" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "availability_exceptions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "calendar_connections" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "busy_blocks" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "price_history" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "gateway_events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "refunds" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "invoices_lines" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "invoices" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "bookings_time_request_preferred_days" CASCADE;
  DROP TABLE "bookings" CASCADE;
  DROP TABLE "bookings_rels" CASCADE;
  DROP TABLE "events" CASCADE;
  DROP TABLE "availability_rules_spans" CASCADE;
  DROP TABLE "availability_rules" CASCADE;
  DROP TABLE "availability_exceptions_spans" CASCADE;
  DROP TABLE "availability_exceptions" CASCADE;
  DROP TABLE "calendar_connections" CASCADE;
  DROP TABLE "busy_blocks" CASCADE;
  DROP TABLE "price_history" CASCADE;
  DROP TABLE "payments" CASCADE;
  DROP TABLE "gateway_events" CASCADE;
  DROP TABLE "refunds" CASCADE;
  DROP TABLE "invoices_lines" CASCADE;
  DROP TABLE "invoices" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_bookings_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_events_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_availability_rules_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_availability_exceptions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_calendar_connections_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_price_history_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_payments_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_refunds_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_invoices_fk";
  
  DROP INDEX "payload_locked_documents_rels_bookings_id_idx";
  DROP INDEX "payload_locked_documents_rels_events_id_idx";
  DROP INDEX "payload_locked_documents_rels_availability_rules_id_idx";
  DROP INDEX "payload_locked_documents_rels_availability_exceptions_id_idx";
  DROP INDEX "payload_locked_documents_rels_calendar_connections_id_idx";
  DROP INDEX "payload_locked_documents_rels_price_history_id_idx";
  DROP INDEX "payload_locked_documents_rels_payments_id_idx";
  DROP INDEX "payload_locked_documents_rels_refunds_id_idx";
  DROP INDEX "payload_locked_documents_rels_invoices_id_idx";
  ALTER TABLE "services" DROP COLUMN "gst_rate_basis_points";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "bookings_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "availability_rules_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "availability_exceptions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "calendar_connections_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "price_history_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "payments_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "refunds_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "invoices_id";
  ALTER TABLE "settings" DROP COLUMN "money_refund_approval_threshold_paise";
  DROP TYPE "public"."enum_bookings_type";
  DROP TYPE "public"."enum_bookings_status";
  DROP TYPE "public"."enum_bookings_payment_status";
  DROP TYPE "public"."enum_bookings_who_for";
  DROP TYPE "public"."enum_bookings_age_band";
  DROP TYPE "public"."enum_bookings_format";
  DROP TYPE "public"."enum_bookings_startsat_tz";
  DROP TYPE "public"."enum_bookings_endsat_tz";
  DROP TYPE "public"."enum_bookings_holdexpiresat_tz";
  DROP TYPE "public"."enum_bookings_confirmedat_tz";
  DROP TYPE "public"."enum_bookings_cancellation_at_tz";
  DROP TYPE "public"."enum_events_kind";
  DROP TYPE "public"."enum_events_startsat_tz";
  DROP TYPE "public"."enum_events_endsat_tz";
  DROP TYPE "public"."enum_events_format";
  DROP TYPE "public"."enum_availability_rules_weekday";
  DROP TYPE "public"."enum_availability_exceptions_kind";
  DROP TYPE "public"."enum_calendar_connections_provider";
  DROP TYPE "public"."enum_calendar_connections_status";
  DROP TYPE "public"."enum_calendar_connections_lastsyncedat_tz";
  DROP TYPE "public"."enum_calendar_connections_watch_expiresat_tz";
  DROP TYPE "public"."enum_busy_blocks_startsat_tz";
  DROP TYPE "public"."enum_busy_blocks_endsat_tz";
  DROP TYPE "public"."enum_busy_blocks_source";
  DROP TYPE "public"."enum_price_history_validfrom_tz";
  DROP TYPE "public"."enum_price_history_validto_tz";
  DROP TYPE "public"."enum_payments_kind";
  DROP TYPE "public"."enum_payments_gateway";
  DROP TYPE "public"."enum_payments_status";
  DROP TYPE "public"."enum_payments_currency";
  DROP TYPE "public"."enum_payments_capturedat_tz";
  DROP TYPE "public"."enum_payments_linksentat_tz";
  DROP TYPE "public"."enum_payments_expiresat_tz";
  DROP TYPE "public"."enum_gateway_events_gateway";
  DROP TYPE "public"."enum_gateway_events_source";
  DROP TYPE "public"."enum_gateway_events_receivedat_tz";
  DROP TYPE "public"."enum_gateway_events_outcome";
  DROP TYPE "public"."enum_refunds_status";
  DROP TYPE "public"."enum_refunds_reason";
  DROP TYPE "public"."enum_refunds_decidedat_tz";
  DROP TYPE "public"."enum_refunds_processedat_tz";
  DROP TYPE "public"."enum_invoices_kind";
  DROP TYPE "public"."enum_invoices_status";
  DROP TYPE "public"."enum_invoices_issuedat_tz";`)
}
