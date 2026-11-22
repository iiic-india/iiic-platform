import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'B4-expire-holds';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'B2-poll-pending-orders';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'B11-reconcile';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'B2-B7-sync-calendar-event';
  ALTER TYPE "public"."enum_payload_jobs_log_task_slug" ADD VALUE 'B14-refresh-busy-times';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'B4-expire-holds';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'B2-poll-pending-orders';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'B11-reconcile';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'B2-B7-sync-calendar-event';
  ALTER TYPE "public"."enum_payload_jobs_task_slug" ADD VALUE 'B14-refresh-busy-times';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_log_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_log_task_slug" AS ENUM('inline', 'O5-purge-missing-pages');
  ALTER TABLE "payload_jobs_log" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_log_task_slug" USING "task_slug"::"public"."enum_payload_jobs_log_task_slug";
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE text;
  DROP TYPE "public"."enum_payload_jobs_task_slug";
  CREATE TYPE "public"."enum_payload_jobs_task_slug" AS ENUM('inline', 'O5-purge-missing-pages');
  ALTER TABLE "payload_jobs" ALTER COLUMN "task_slug" SET DATA TYPE "public"."enum_payload_jobs_task_slug" USING "task_slug"::"public"."enum_payload_jobs_task_slug";`)
}
