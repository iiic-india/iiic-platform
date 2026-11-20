import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_doors" ADD COLUMN "anchor" varchar;
  ALTER TABLE "pages_blocks_statement" ADD COLUMN "anchor" varchar;
  ALTER TABLE "pages_blocks_steps" ADD COLUMN "anchor" varchar;
  ALTER TABLE "pages_blocks_comparison" ADD COLUMN "anchor" varchar;
  ALTER TABLE "pages_blocks_points" ADD COLUMN "anchor" varchar;
  ALTER TABLE "pages_blocks_cards" ADD COLUMN "anchor" varchar;
  ALTER TABLE "pages_blocks_fact_list" ADD COLUMN "anchor" varchar;
  ALTER TABLE "pages_blocks_founder_note" ADD COLUMN "anchor" varchar;
  ALTER TABLE "_pages_v_blocks_doors" ADD COLUMN "anchor" varchar;
  ALTER TABLE "_pages_v_blocks_statement" ADD COLUMN "anchor" varchar;
  ALTER TABLE "_pages_v_blocks_steps" ADD COLUMN "anchor" varchar;
  ALTER TABLE "_pages_v_blocks_comparison" ADD COLUMN "anchor" varchar;
  ALTER TABLE "_pages_v_blocks_points" ADD COLUMN "anchor" varchar;
  ALTER TABLE "_pages_v_blocks_cards" ADD COLUMN "anchor" varchar;
  ALTER TABLE "_pages_v_blocks_fact_list" ADD COLUMN "anchor" varchar;
  ALTER TABLE "_pages_v_blocks_founder_note" ADD COLUMN "anchor" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages_blocks_doors" DROP COLUMN "anchor";
  ALTER TABLE "pages_blocks_statement" DROP COLUMN "anchor";
  ALTER TABLE "pages_blocks_steps" DROP COLUMN "anchor";
  ALTER TABLE "pages_blocks_comparison" DROP COLUMN "anchor";
  ALTER TABLE "pages_blocks_points" DROP COLUMN "anchor";
  ALTER TABLE "pages_blocks_cards" DROP COLUMN "anchor";
  ALTER TABLE "pages_blocks_fact_list" DROP COLUMN "anchor";
  ALTER TABLE "pages_blocks_founder_note" DROP COLUMN "anchor";
  ALTER TABLE "_pages_v_blocks_doors" DROP COLUMN "anchor";
  ALTER TABLE "_pages_v_blocks_statement" DROP COLUMN "anchor";
  ALTER TABLE "_pages_v_blocks_steps" DROP COLUMN "anchor";
  ALTER TABLE "_pages_v_blocks_comparison" DROP COLUMN "anchor";
  ALTER TABLE "_pages_v_blocks_points" DROP COLUMN "anchor";
  ALTER TABLE "_pages_v_blocks_cards" DROP COLUMN "anchor";
  ALTER TABLE "_pages_v_blocks_fact_list" DROP COLUMN "anchor";
  ALTER TABLE "_pages_v_blocks_founder_note" DROP COLUMN "anchor";`)
}
