import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_pages_legal_review" AS ENUM('draft', 'approved');
  CREATE TYPE "public"."enum__pages_v_version_legal_review" AS ENUM('draft', 'approved');
  ALTER TABLE "pages" ADD COLUMN "legal_review" "enum_pages_legal_review";
  ALTER TABLE "_pages_v" ADD COLUMN "version_legal_review" "enum__pages_v_version_legal_review";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" DROP COLUMN "legal_review";
  ALTER TABLE "_pages_v" DROP COLUMN "version_legal_review";
  DROP TYPE "public"."enum_pages_legal_review";
  DROP TYPE "public"."enum__pages_v_version_legal_review";`)
}
