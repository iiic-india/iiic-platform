import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_pages_facts_source" ADD VALUE 'pageCopy' BEFORE 'counted';
  ALTER TYPE "public"."enum__pages_v_version_facts_source" ADD VALUE 'pageCopy' BEFORE 'counted';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_facts" ALTER COLUMN "source" SET DATA TYPE text;
  DROP TYPE "public"."enum_pages_facts_source";
  CREATE TYPE "public"."enum_pages_facts_source" AS ENUM('brochure', 'site', 'form', 'founder', 'description', 'counted');
  ALTER TABLE "pages_facts" ALTER COLUMN "source" SET DATA TYPE "public"."enum_pages_facts_source" USING "source"::"public"."enum_pages_facts_source";
  ALTER TABLE "_pages_v_version_facts" ALTER COLUMN "source" SET DATA TYPE text;
  DROP TYPE "public"."enum__pages_v_version_facts_source";
  CREATE TYPE "public"."enum__pages_v_version_facts_source" AS ENUM('brochure', 'site', 'form', 'founder', 'description', 'counted');
  ALTER TABLE "_pages_v_version_facts" ALTER COLUMN "source" SET DATA TYPE "public"."enum__pages_v_version_facts_source" USING "source"::"public"."enum__pages_v_version_facts_source";`)
}
