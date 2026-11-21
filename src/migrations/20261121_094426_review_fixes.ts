import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_audit_log_at_tz" AS ENUM('Asia/Kolkata');
  ALTER TYPE "public"."enum_pages_facts_source" ADD VALUE 'form' BEFORE 'founder';
  ALTER TYPE "public"."enum__pages_v_version_facts_source" ADD VALUE 'form' BEFORE 'founder';
  ALTER TABLE "pages" ADD COLUMN "first_published_at" timestamp(3) with time zone;
  ALTER TABLE "_pages_v" ADD COLUMN "version_first_published_at" timestamp(3) with time zone;
  ALTER TABLE "audit_log" ADD COLUMN "at_tz" "enum_audit_log_at_tz" DEFAULT 'Asia/Kolkata' NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_facts" ALTER COLUMN "source" SET DATA TYPE text;
  DROP TYPE "public"."enum_pages_facts_source";
  CREATE TYPE "public"."enum_pages_facts_source" AS ENUM('brochure', 'site', 'founder', 'description', 'counted');
  ALTER TABLE "pages_facts" ALTER COLUMN "source" SET DATA TYPE "public"."enum_pages_facts_source" USING "source"::"public"."enum_pages_facts_source";
  ALTER TABLE "_pages_v_version_facts" ALTER COLUMN "source" SET DATA TYPE text;
  DROP TYPE "public"."enum__pages_v_version_facts_source";
  CREATE TYPE "public"."enum__pages_v_version_facts_source" AS ENUM('brochure', 'site', 'founder', 'description', 'counted');
  ALTER TABLE "_pages_v_version_facts" ALTER COLUMN "source" SET DATA TYPE "public"."enum__pages_v_version_facts_source" USING "source"::"public"."enum__pages_v_version_facts_source";
  ALTER TABLE "pages" DROP COLUMN "first_published_at";
  ALTER TABLE "_pages_v" DROP COLUMN "version_first_published_at";
  ALTER TABLE "audit_log" DROP COLUMN "at_tz";
  DROP TYPE "public"."enum_audit_log_at_tz";`)
}
