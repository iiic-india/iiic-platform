import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_organisations_type" AS ENUM('business', 'institution');
  CREATE TYPE "public"."enum_organisations_team_size_band" AS ENUM('upTo10', 'from11to50', 'from51to200', 'from201to500', 'over500');
  CREATE TYPE "public"."enum_leads_kind" AS ENUM('consultancy', 'partnership');
  CREATE TYPE "public"."enum_leads_stage" AS ENUM('new', 'contacted', 'teamMapScheduled', 'teamMapDone', 'debriefHeld', 'proposalSent', 'won', 'lost', 'inConversation', 'mouDrafted', 'signed', 'closed');
  CREATE TYPE "public"."enum_leads_stagechangedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_leads_source" AS ENUM('teamMapForm', 'partnershipForm', 'proposalCall', 'office');
  CREATE TYPE "public"."enum_leads_touchedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_leads_lastactivityat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_leads_closedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_leads_alerts_untouched" AS ENUM('amber', 'red');
  CREATE TYPE "public"."enum_leads_alerts_stalefor_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_lead_activities_type" AS ENUM('note', 'call', 'email', 'whatsapp', 'stageChange', 'file', 'enquiry', 'proposal', 'booking');
  CREATE TYPE "public"."enum_lead_activities_at_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_lead_activities_from_stage" AS ENUM('new', 'contacted', 'teamMapScheduled', 'teamMapDone', 'debriefHeld', 'proposalSent', 'won', 'lost', 'inConversation', 'mouDrafted', 'signed', 'closed');
  CREATE TYPE "public"."enum_lead_activities_to_stage" AS ENUM('new', 'contacted', 'teamMapScheduled', 'teamMapDone', 'debriefHeld', 'proposalSent', 'won', 'lost', 'inConversation', 'mouDrafted', 'signed', 'closed');
  CREATE TYPE "public"."enum_tasks_kind" AS ENUM('firstReply', 'proposalFollowUp', 'reviewFollowUpDraft', 'other');
  CREATE TYPE "public"."enum_tasks_status" AS ENUM('open', 'done', 'cancelled');
  CREATE TYPE "public"."enum_tasks_role" AS ENUM('operator', 'owner');
  CREATE TYPE "public"."enum_tasks_doneat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_enquiries_kind" AS ENUM('teamMap', 'partnership');
  CREATE TYPE "public"."enum_enquiries_status" AS ENUM('received', 'spam');
  CREATE TYPE "public"."enum_enquiries_outcome" AS ENUM('newLead', 'existingLead');
  CREATE TYPE "public"."enum_enquiries_receivedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_enquiries_submitted_team_size_band" AS ENUM('upTo10', 'from11to50', 'from51to200', 'from201to500', 'over500');
  CREATE TYPE "public"."enum_enquiries_conflict" AS ENUM('emailAndMobileDiffer');
  CREATE TYPE "public"."enum_enquiries_turnstile" AS ENUM('passed', 'off');
  CREATE TYPE "public"."enum_proposals_status" AS ENUM('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired');
  CREATE TYPE "public"."enum_proposals_acceptedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_proposals_declinedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_proposals_expiredat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_proposal_versions_pdf_renderedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_proposal_versions_sending_sentat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_proposal_versions_sending_emailedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_proposal_versions_sending_supersededat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_proposal_versions_sending_linkrevokedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_proposal_versions_tracking_firstviewedat_tz" AS ENUM('Asia/Kolkata');
  CREATE TYPE "public"."enum_proposal_versions_tracking_lastviewedat_tz" AS ENUM('Asia/Kolkata');
  ALTER TYPE "public"."enum_consents_purpose" ADD VALUE 'enquiryReplies';
  ALTER TYPE "public"."enum_consent_versions_purpose" ADD VALUE 'enquiryReplies';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'P2-lead-from-call';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'P3-P4-lead-alerts';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'P8-expire-proposals';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'P2-lead-from-call';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'P3-P4-lead-alerts';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'P8-expire-proposals';
  CREATE TABLE "pages_blocks_team_map_request" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "pages_blocks_partnership_enquiry" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_team_map_request" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_partnership_enquiry" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "organisations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"type" "enum_organisations_type" DEFAULT 'business' NOT NULL,
  	"website" varchar,
  	"sector" varchar,
  	"team_size_band" "enum_organisations_team_size_band",
  	"city" varchar,
  	"billing_gstin" varchar,
  	"billing_line1" varchar,
  	"billing_line2" varchar,
  	"billing_city" varchar,
  	"billing_state" varchar,
  	"billing_postal_code" varchar,
  	"domain" varchar,
  	"name_key" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "leads" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"kind" "enum_leads_kind" DEFAULT 'consultancy' NOT NULL,
  	"stage" "enum_leads_stage" DEFAULT 'new' NOT NULL,
  	"stage_changed_at" timestamp(3) with time zone,
  	"stagechangedat_tz" "enum_leads_stagechangedat_tz" DEFAULT 'Asia/Kolkata',
  	"organisation_id" integer,
  	"person_id" integer,
  	"owner_id" integer,
  	"next_action" varchar,
  	"due_on" varchar,
  	"source" "enum_leads_source" NOT NULL,
  	"source_note" varchar,
  	"utm_source" varchar,
  	"utm_medium" varchar,
  	"utm_campaign" varchar,
  	"utm_term" varchar,
  	"utm_content" varchar,
  	"value_estimate_paise" numeric,
  	"end_reason" varchar,
  	"previous_lead_id" integer,
  	"touched_at" timestamp(3) with time zone,
  	"touchedat_tz" "enum_leads_touchedat_tz" DEFAULT 'Asia/Kolkata',
  	"last_activity_at" timestamp(3) with time zone,
  	"lastactivityat_tz" "enum_leads_lastactivityat_tz" DEFAULT 'Asia/Kolkata',
  	"closed_at" timestamp(3) with time zone,
  	"closedat_tz" "enum_leads_closedat_tz" DEFAULT 'Asia/Kolkata',
  	"alerts_untouched" "enum_leads_alerts_untouched",
  	"alerts_stale_for" timestamp(3) with time zone,
  	"alerts_stalefor_tz" "enum_leads_alerts_stalefor_tz" DEFAULT 'Asia/Kolkata',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "leads_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"bookings_id" integer
  );
  
  CREATE TABLE "lead_activities" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"lead_id" integer NOT NULL,
  	"type" "enum_lead_activities_type" NOT NULL,
  	"at" timestamp(3) with time zone NOT NULL,
  	"at_tz" "enum_lead_activities_at_tz" DEFAULT 'Asia/Kolkata' NOT NULL,
  	"body" varchar,
  	"file_reference" varchar,
  	"by_id" integer,
  	"from_stage" "enum_lead_activities_from_stage",
  	"to_stage" "enum_lead_activities_to_stage",
  	"enquiry_id" integer,
  	"proposal_version_id" integer,
  	"booking_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "tasks" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"kind" "enum_tasks_kind" DEFAULT 'other' NOT NULL,
  	"status" "enum_tasks_status" DEFAULT 'open' NOT NULL,
  	"due_on" varchar NOT NULL,
  	"role" "enum_tasks_role" DEFAULT 'operator' NOT NULL,
  	"assignee_id" integer,
  	"lead_id" integer,
  	"note" varchar,
  	"done_at" timestamp(3) with time zone,
  	"doneat_tz" "enum_tasks_doneat_tz" DEFAULT 'Asia/Kolkata',
  	"done_by_id" integer,
  	"automation" varchar,
  	"key" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "enquiries" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"kind" "enum_enquiries_kind" NOT NULL,
  	"status" "enum_enquiries_status" DEFAULT 'received' NOT NULL,
  	"outcome" "enum_enquiries_outcome",
  	"received_at" timestamp(3) with time zone NOT NULL,
  	"receivedat_tz" "enum_enquiries_receivedat_tz" DEFAULT 'Asia/Kolkata' NOT NULL,
  	"submitted_organisation_name" varchar NOT NULL,
  	"submitted_website" varchar,
  	"submitted_team_size_band" "enum_enquiries_submitted_team_size_band",
  	"submitted_sector" varchar,
  	"submitted_contact_name" varchar NOT NULL,
  	"submitted_role" varchar,
  	"submitted_email" varchar NOT NULL,
  	"submitted_mobile" varchar,
  	"submitted_message" varchar,
  	"person_id" integer,
  	"organisation_id" integer,
  	"lead_id" integer,
  	"conflict" "enum_enquiries_conflict",
  	"page" varchar,
  	"turnstile" "enum_enquiries_turnstile",
  	"utm_source" varchar,
  	"utm_medium" varchar,
  	"utm_campaign" varchar,
  	"utm_term" varchar,
  	"utm_content" varchar,
  	"submitter_hash" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "enquiries_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"consents_id" integer
  );
  
  CREATE TABLE "proposals_phases" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"duration" varchar NOT NULL,
  	"what" varchar NOT NULL,
  	"outcome" varchar NOT NULL
  );
  
  CREATE TABLE "proposals_fees" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"item" varchar NOT NULL,
  	"amount_paise" numeric NOT NULL
  );
  
  CREATE TABLE "proposals" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"reference" varchar,
  	"lead_id" integer NOT NULL,
  	"status" "enum_proposals_status" DEFAULT 'draft' NOT NULL,
  	"title" varchar NOT NULL,
  	"subtitle" varchar,
  	"prepared_by_name" varchar,
  	"prepared_by_title" varchar,
  	"valid_until" varchar,
  	"situation" varchar,
  	"approach" varchar,
  	"measures" varchar,
  	"fee_total_paise" numeric,
  	"next_step" varchar,
  	"current_version_id" integer,
  	"sent_version_id" integer,
  	"accepted_at" timestamp(3) with time zone,
  	"acceptedat_tz" "enum_proposals_acceptedat_tz" DEFAULT 'Asia/Kolkata',
  	"declined_at" timestamp(3) with time zone,
  	"declinedat_tz" "enum_proposals_declinedat_tz" DEFAULT 'Asia/Kolkata',
  	"expired_at" timestamp(3) with time zone,
  	"expiredat_tz" "enum_proposals_expiredat_tz" DEFAULT 'Asia/Kolkata',
  	"answer_note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "proposal_versions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"proposal_id" integer NOT NULL,
  	"number" numeric NOT NULL,
  	"created_by_id" integer,
  	"document" jsonb NOT NULL,
  	"fee_total_paise" numeric,
  	"pdf_key" varchar,
  	"pdf_sha256" varchar,
  	"pdf_rendered_at" timestamp(3) with time zone,
  	"pdf_renderedat_tz" "enum_proposal_versions_pdf_renderedat_tz" DEFAULT 'Asia/Kolkata',
  	"sending_sent_at" timestamp(3) with time zone,
  	"sending_sentat_tz" "enum_proposal_versions_sending_sentat_tz" DEFAULT 'Asia/Kolkata',
  	"sending_sent_by_id" integer,
  	"sending_sent_to_id" integer,
  	"sending_emailed_at" timestamp(3) with time zone,
  	"sending_emailedat_tz" "enum_proposal_versions_sending_emailedat_tz" DEFAULT 'Asia/Kolkata',
  	"sending_superseded_at" timestamp(3) with time zone,
  	"sending_supersededat_tz" "enum_proposal_versions_sending_supersededat_tz" DEFAULT 'Asia/Kolkata',
  	"sending_link_revoked_at" timestamp(3) with time zone,
  	"sending_linkrevokedat_tz" "enum_proposal_versions_sending_linkrevokedat_tz" DEFAULT 'Asia/Kolkata',
  	"tracking_first_viewed_at" timestamp(3) with time zone,
  	"tracking_firstviewedat_tz" "enum_proposal_versions_tracking_firstviewedat_tz" DEFAULT 'Asia/Kolkata',
  	"tracking_last_viewed_at" timestamp(3) with time zone,
  	"tracking_lastviewedat_tz" "enum_proposal_versions_tracking_lastviewedat_tz" DEFAULT 'Asia/Kolkata',
  	"tracking_view_count" numeric DEFAULT 0,
  	"link_token_hash" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "people" ADD COLUMN "organisation_id" integer;
  ALTER TABLE "people" ADD COLUMN "job_title" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "organisations_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "leads_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "lead_activities_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tasks_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "enquiries_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "proposals_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "proposal_versions_id" integer;
  ALTER TABLE "pages_blocks_team_map_request" ADD CONSTRAINT "pages_blocks_team_map_request_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_partnership_enquiry" ADD CONSTRAINT "pages_blocks_partnership_enquiry_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_team_map_request" ADD CONSTRAINT "_pages_v_blocks_team_map_request_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_partnership_enquiry" ADD CONSTRAINT "_pages_v_blocks_partnership_enquiry_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "leads" ADD CONSTRAINT "leads_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "leads" ADD CONSTRAINT "leads_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "leads" ADD CONSTRAINT "leads_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "leads" ADD CONSTRAINT "leads_previous_lead_id_leads_id_fk" FOREIGN KEY ("previous_lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "leads_rels" ADD CONSTRAINT "leads_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "leads_rels" ADD CONSTRAINT "leads_rels_bookings_fk" FOREIGN KEY ("bookings_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_by_id_users_id_fk" FOREIGN KEY ("by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_enquiry_id_enquiries_id_fk" FOREIGN KEY ("enquiry_id") REFERENCES "public"."enquiries"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_proposal_version_id_proposal_versions_id_fk" FOREIGN KEY ("proposal_version_id") REFERENCES "public"."proposal_versions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tasks" ADD CONSTRAINT "tasks_done_by_id_users_id_fk" FOREIGN KEY ("done_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "enquiries" ADD CONSTRAINT "enquiries_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "enquiries_rels" ADD CONSTRAINT "enquiries_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."enquiries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "enquiries_rels" ADD CONSTRAINT "enquiries_rels_consents_fk" FOREIGN KEY ("consents_id") REFERENCES "public"."consents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "proposals_phases" ADD CONSTRAINT "proposals_phases_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "proposals_fees" ADD CONSTRAINT "proposals_fees_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "proposals" ADD CONSTRAINT "proposals_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "proposals" ADD CONSTRAINT "proposals_current_version_id_proposal_versions_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."proposal_versions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "proposals" ADD CONSTRAINT "proposals_sent_version_id_proposal_versions_id_fk" FOREIGN KEY ("sent_version_id") REFERENCES "public"."proposal_versions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_sending_sent_by_id_users_id_fk" FOREIGN KEY ("sending_sent_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_sending_sent_to_id_people_id_fk" FOREIGN KEY ("sending_sent_to_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "pages_blocks_team_map_request_order_idx" ON "pages_blocks_team_map_request" USING btree ("_order");
  CREATE INDEX "pages_blocks_team_map_request_parent_id_idx" ON "pages_blocks_team_map_request" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_team_map_request_path_idx" ON "pages_blocks_team_map_request" USING btree ("_path");
  CREATE INDEX "pages_blocks_partnership_enquiry_order_idx" ON "pages_blocks_partnership_enquiry" USING btree ("_order");
  CREATE INDEX "pages_blocks_partnership_enquiry_parent_id_idx" ON "pages_blocks_partnership_enquiry" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_partnership_enquiry_path_idx" ON "pages_blocks_partnership_enquiry" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_team_map_request_order_idx" ON "_pages_v_blocks_team_map_request" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_team_map_request_parent_id_idx" ON "_pages_v_blocks_team_map_request" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_team_map_request_path_idx" ON "_pages_v_blocks_team_map_request" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_partnership_enquiry_order_idx" ON "_pages_v_blocks_partnership_enquiry" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_partnership_enquiry_parent_id_idx" ON "_pages_v_blocks_partnership_enquiry" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_partnership_enquiry_path_idx" ON "_pages_v_blocks_partnership_enquiry" USING btree ("_path");
  CREATE INDEX "organisations_domain_idx" ON "organisations" USING btree ("domain");
  CREATE INDEX "organisations_name_key_idx" ON "organisations" USING btree ("name_key");
  CREATE INDEX "organisations_updated_at_idx" ON "organisations" USING btree ("updated_at");
  CREATE INDEX "organisations_created_at_idx" ON "organisations" USING btree ("created_at");
  CREATE INDEX "leads_kind_idx" ON "leads" USING btree ("kind");
  CREATE INDEX "leads_stage_idx" ON "leads" USING btree ("stage");
  CREATE INDEX "leads_organisation_idx" ON "leads" USING btree ("organisation_id");
  CREATE INDEX "leads_person_idx" ON "leads" USING btree ("person_id");
  CREATE INDEX "leads_owner_idx" ON "leads" USING btree ("owner_id");
  CREATE INDEX "leads_due_on_idx" ON "leads" USING btree ("due_on");
  CREATE INDEX "leads_previous_lead_idx" ON "leads" USING btree ("previous_lead_id");
  CREATE INDEX "leads_updated_at_idx" ON "leads" USING btree ("updated_at");
  CREATE INDEX "leads_created_at_idx" ON "leads" USING btree ("created_at");
  CREATE INDEX "leads_rels_order_idx" ON "leads_rels" USING btree ("order");
  CREATE INDEX "leads_rels_parent_idx" ON "leads_rels" USING btree ("parent_id");
  CREATE INDEX "leads_rels_path_idx" ON "leads_rels" USING btree ("path");
  CREATE INDEX "leads_rels_bookings_id_idx" ON "leads_rels" USING btree ("bookings_id");
  CREATE INDEX "lead_activities_lead_idx" ON "lead_activities" USING btree ("lead_id");
  CREATE INDEX "lead_activities_at_idx" ON "lead_activities" USING btree ("at");
  CREATE INDEX "lead_activities_by_idx" ON "lead_activities" USING btree ("by_id");
  CREATE INDEX "lead_activities_enquiry_idx" ON "lead_activities" USING btree ("enquiry_id");
  CREATE INDEX "lead_activities_proposal_version_idx" ON "lead_activities" USING btree ("proposal_version_id");
  CREATE INDEX "lead_activities_booking_idx" ON "lead_activities" USING btree ("booking_id");
  CREATE INDEX "lead_activities_updated_at_idx" ON "lead_activities" USING btree ("updated_at");
  CREATE INDEX "lead_activities_created_at_idx" ON "lead_activities" USING btree ("created_at");
  CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");
  CREATE INDEX "tasks_due_on_idx" ON "tasks" USING btree ("due_on");
  CREATE INDEX "tasks_assignee_idx" ON "tasks" USING btree ("assignee_id");
  CREATE INDEX "tasks_lead_idx" ON "tasks" USING btree ("lead_id");
  CREATE INDEX "tasks_done_by_idx" ON "tasks" USING btree ("done_by_id");
  CREATE UNIQUE INDEX "tasks_key_idx" ON "tasks" USING btree ("key");
  CREATE INDEX "tasks_updated_at_idx" ON "tasks" USING btree ("updated_at");
  CREATE INDEX "tasks_created_at_idx" ON "tasks" USING btree ("created_at");
  CREATE INDEX "enquiries_status_idx" ON "enquiries" USING btree ("status");
  CREATE INDEX "enquiries_received_at_idx" ON "enquiries" USING btree ("received_at");
  CREATE INDEX "enquiries_person_idx" ON "enquiries" USING btree ("person_id");
  CREATE INDEX "enquiries_organisation_idx" ON "enquiries" USING btree ("organisation_id");
  CREATE INDEX "enquiries_lead_idx" ON "enquiries" USING btree ("lead_id");
  CREATE INDEX "enquiries_submitter_hash_idx" ON "enquiries" USING btree ("submitter_hash");
  CREATE INDEX "enquiries_updated_at_idx" ON "enquiries" USING btree ("updated_at");
  CREATE INDEX "enquiries_created_at_idx" ON "enquiries" USING btree ("created_at");
  CREATE INDEX "enquiries_rels_order_idx" ON "enquiries_rels" USING btree ("order");
  CREATE INDEX "enquiries_rels_parent_idx" ON "enquiries_rels" USING btree ("parent_id");
  CREATE INDEX "enquiries_rels_path_idx" ON "enquiries_rels" USING btree ("path");
  CREATE INDEX "enquiries_rels_consents_id_idx" ON "enquiries_rels" USING btree ("consents_id");
  CREATE INDEX "proposals_phases_order_idx" ON "proposals_phases" USING btree ("_order");
  CREATE INDEX "proposals_phases_parent_id_idx" ON "proposals_phases" USING btree ("_parent_id");
  CREATE INDEX "proposals_fees_order_idx" ON "proposals_fees" USING btree ("_order");
  CREATE INDEX "proposals_fees_parent_id_idx" ON "proposals_fees" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "proposals_reference_idx" ON "proposals" USING btree ("reference");
  CREATE INDEX "proposals_lead_idx" ON "proposals" USING btree ("lead_id");
  CREATE INDEX "proposals_status_idx" ON "proposals" USING btree ("status");
  CREATE INDEX "proposals_current_version_idx" ON "proposals" USING btree ("current_version_id");
  CREATE INDEX "proposals_sent_version_idx" ON "proposals" USING btree ("sent_version_id");
  CREATE INDEX "proposals_updated_at_idx" ON "proposals" USING btree ("updated_at");
  CREATE INDEX "proposals_created_at_idx" ON "proposals" USING btree ("created_at");
  CREATE INDEX "proposal_versions_proposal_idx" ON "proposal_versions" USING btree ("proposal_id");
  CREATE INDEX "proposal_versions_created_by_idx" ON "proposal_versions" USING btree ("created_by_id");
  CREATE INDEX "proposal_versions_sending_sending_sent_by_idx" ON "proposal_versions" USING btree ("sending_sent_by_id");
  CREATE INDEX "proposal_versions_sending_sending_sent_to_idx" ON "proposal_versions" USING btree ("sending_sent_to_id");
  CREATE UNIQUE INDEX "proposal_versions_link_token_hash_idx" ON "proposal_versions" USING btree ("link_token_hash");
  CREATE INDEX "proposal_versions_updated_at_idx" ON "proposal_versions" USING btree ("updated_at");
  CREATE INDEX "proposal_versions_created_at_idx" ON "proposal_versions" USING btree ("created_at");
  ALTER TABLE "people" ADD CONSTRAINT "people_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_organisations_fk" FOREIGN KEY ("organisations_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_leads_fk" FOREIGN KEY ("leads_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_lead_activities_fk" FOREIGN KEY ("lead_activities_id") REFERENCES "public"."lead_activities"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tasks_fk" FOREIGN KEY ("tasks_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_enquiries_fk" FOREIGN KEY ("enquiries_id") REFERENCES "public"."enquiries"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_proposals_fk" FOREIGN KEY ("proposals_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_proposal_versions_fk" FOREIGN KEY ("proposal_versions_id") REFERENCES "public"."proposal_versions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "people_organisation_idx" ON "people" USING btree ("organisation_id");
  CREATE INDEX "payload_locked_documents_rels_organisations_id_idx" ON "payload_locked_documents_rels" USING btree ("organisations_id");
  CREATE INDEX "payload_locked_documents_rels_leads_id_idx" ON "payload_locked_documents_rels" USING btree ("leads_id");
  CREATE INDEX "payload_locked_documents_rels_lead_activities_id_idx" ON "payload_locked_documents_rels" USING btree ("lead_activities_id");
  CREATE INDEX "payload_locked_documents_rels_tasks_id_idx" ON "payload_locked_documents_rels" USING btree ("tasks_id");
  CREATE INDEX "payload_locked_documents_rels_enquiries_id_idx" ON "payload_locked_documents_rels" USING btree ("enquiries_id");
  CREATE INDEX "payload_locked_documents_rels_proposals_id_idx" ON "payload_locked_documents_rels" USING btree ("proposals_id");
  CREATE INDEX "payload_locked_documents_rels_proposal_versions_id_idx" ON "payload_locked_documents_rels" USING btree ("proposal_versions_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_team_map_request" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_partnership_enquiry" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_team_map_request" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_partnership_enquiry" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "organisations" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "leads" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "leads_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "lead_activities" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "tasks" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "enquiries" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "enquiries_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "proposals_phases" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "proposals_fees" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "proposals" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "proposal_versions" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "pages_blocks_team_map_request" CASCADE;
  DROP TABLE "pages_blocks_partnership_enquiry" CASCADE;
  DROP TABLE "_pages_v_blocks_team_map_request" CASCADE;
  DROP TABLE "_pages_v_blocks_partnership_enquiry" CASCADE;
  DROP TABLE "organisations" CASCADE;
  DROP TABLE "leads" CASCADE;
  DROP TABLE "leads_rels" CASCADE;
  DROP TABLE "lead_activities" CASCADE;
  DROP TABLE "tasks" CASCADE;
  DROP TABLE "enquiries" CASCADE;
  DROP TABLE "enquiries_rels" CASCADE;
  DROP TABLE "proposals_phases" CASCADE;
  DROP TABLE "proposals_fees" CASCADE;
  DROP TABLE "proposals" CASCADE;
  DROP TABLE "proposal_versions" CASCADE;
  ALTER TABLE "people" DROP CONSTRAINT "people_organisation_id_organisations_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_organisations_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_leads_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_lead_activities_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_tasks_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_enquiries_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_proposals_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_proposal_versions_fk";
  
  ALTER TABLE "consents" ALTER COLUMN "purpose" SET DATA TYPE text;
  DROP TYPE "public"."enum_consents_purpose";
  CREATE TYPE "public"."enum_consents_purpose" AS ENUM('bookingCommunications', 'marketingEmail', 'marketingWhatsapp', 'mapStorage', 'mapSharing', 'testimonialPublication', 'relatedProgrammes');
  ALTER TABLE "consents" ALTER COLUMN "purpose" SET DATA TYPE "public"."enum_consents_purpose" USING "purpose"::"public"."enum_consents_purpose";
  ALTER TABLE "consent_versions" ALTER COLUMN "purpose" SET DATA TYPE text;
  DROP TYPE "public"."enum_consent_versions_purpose";
  CREATE TYPE "public"."enum_consent_versions_purpose" AS ENUM('bookingCommunications', 'marketingEmail', 'marketingWhatsapp', 'mapStorage', 'mapSharing', 'testimonialPublication', 'relatedProgrammes');
  ALTER TABLE "consent_versions" ALTER COLUMN "purpose" SET DATA TYPE "public"."enum_consent_versions_purpose" USING "purpose"::"public"."enum_consent_versions_purpose";
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'O5-purge-missing-pages', 'B4-expire-holds', 'B2-poll-pending-orders', 'B11-reconcile', 'B2-B7-sync-calendar-event', 'B14-refresh-busy-times', 'B3-issue-invoice', 'B7-issue-credit-note');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'O5-purge-missing-pages', 'B4-expire-holds', 'B2-poll-pending-orders', 'B11-reconcile', 'B2-B7-sync-calendar-event', 'B14-refresh-busy-times', 'B3-issue-invoice', 'B7-issue-credit-note');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";
  DROP INDEX "people_organisation_idx";
  DROP INDEX "payload_locked_documents_rels_organisations_id_idx";
  DROP INDEX "payload_locked_documents_rels_leads_id_idx";
  DROP INDEX "payload_locked_documents_rels_lead_activities_id_idx";
  DROP INDEX "payload_locked_documents_rels_tasks_id_idx";
  DROP INDEX "payload_locked_documents_rels_enquiries_id_idx";
  DROP INDEX "payload_locked_documents_rels_proposals_id_idx";
  DROP INDEX "payload_locked_documents_rels_proposal_versions_id_idx";
  ALTER TABLE "people" DROP COLUMN "organisation_id";
  ALTER TABLE "people" DROP COLUMN "job_title";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "organisations_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "leads_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "lead_activities_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "tasks_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "enquiries_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "proposals_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "proposal_versions_id";
  DROP TYPE "public"."enum_organisations_type";
  DROP TYPE "public"."enum_organisations_team_size_band";
  DROP TYPE "public"."enum_leads_kind";
  DROP TYPE "public"."enum_leads_stage";
  DROP TYPE "public"."enum_leads_stagechangedat_tz";
  DROP TYPE "public"."enum_leads_source";
  DROP TYPE "public"."enum_leads_touchedat_tz";
  DROP TYPE "public"."enum_leads_lastactivityat_tz";
  DROP TYPE "public"."enum_leads_closedat_tz";
  DROP TYPE "public"."enum_leads_alerts_untouched";
  DROP TYPE "public"."enum_leads_alerts_stalefor_tz";
  DROP TYPE "public"."enum_lead_activities_type";
  DROP TYPE "public"."enum_lead_activities_at_tz";
  DROP TYPE "public"."enum_lead_activities_from_stage";
  DROP TYPE "public"."enum_lead_activities_to_stage";
  DROP TYPE "public"."enum_tasks_kind";
  DROP TYPE "public"."enum_tasks_status";
  DROP TYPE "public"."enum_tasks_role";
  DROP TYPE "public"."enum_tasks_doneat_tz";
  DROP TYPE "public"."enum_enquiries_kind";
  DROP TYPE "public"."enum_enquiries_status";
  DROP TYPE "public"."enum_enquiries_outcome";
  DROP TYPE "public"."enum_enquiries_receivedat_tz";
  DROP TYPE "public"."enum_enquiries_submitted_team_size_band";
  DROP TYPE "public"."enum_enquiries_conflict";
  DROP TYPE "public"."enum_enquiries_turnstile";
  DROP TYPE "public"."enum_proposals_status";
  DROP TYPE "public"."enum_proposals_acceptedat_tz";
  DROP TYPE "public"."enum_proposals_declinedat_tz";
  DROP TYPE "public"."enum_proposals_expiredat_tz";
  DROP TYPE "public"."enum_proposal_versions_pdf_renderedat_tz";
  DROP TYPE "public"."enum_proposal_versions_sending_sentat_tz";
  DROP TYPE "public"."enum_proposal_versions_sending_emailedat_tz";
  DROP TYPE "public"."enum_proposal_versions_sending_supersededat_tz";
  DROP TYPE "public"."enum_proposal_versions_sending_linkrevokedat_tz";
  DROP TYPE "public"."enum_proposal_versions_tracking_firstviewedat_tz";
  DROP TYPE "public"."enum_proposal_versions_tracking_lastviewedat_tz";`)
}
