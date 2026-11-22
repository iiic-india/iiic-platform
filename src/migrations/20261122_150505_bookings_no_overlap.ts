import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * A practitioner's time cannot hold two active bookings (docs/04, Rules the schema enforces;
 * docs/10 M3; docs/16 §4). Written by hand, as the audit log's trigger is: Payload generates
 * tables and indexes, not exclusion constraints, and its generated migrations are never edited.
 * It was created blank with `pnpm migrate:create bookings_no_overlap --force-accept-warning`
 * after the generated `m3_foundation`, and is never changed: a later change to the constraint is
 * a new migration of its own.
 *
 * The constraint compares the practitioner with `=` and the booking's [start, end) with `&&`
 * (overlap) through a GiST index, which needs `btree_gist` for the integer column. It covers the
 * states that keep a slot taken, SLOT_BLOCKING_STATUSES in src/lib/booking/states.ts (a unit test
 * holds the two lists together), and only rows with a practitioner and both times: a fixed-time
 * session has no practitioner on the booking, and a time request has no time until one is set.
 * Back-to-back bookings ([10:00, 10:30) and [10:30, 11:00)) do not overlap; the buffer between
 * them is the slot engine's rule, not the database's.
 *
 * Postgres refuses to drop a column the constraint uses unless the drop cascades, so a later
 * generated migration that removes or renames `practitioner_id`, `starts_at`, `ends_at` or
 * `status` fails loudly instead of losing the guard; an integration test checks that the
 * constraint exists and refuses an overlap (tests/int/bookingsConstraint.int.spec.ts).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE EXTENSION IF NOT EXISTS btree_gist;
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_ends_after_start"
    CHECK ("starts_at" IS NULL OR "ends_at" IS NULL OR "ends_at" > "starts_at");
  ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap"
    EXCLUDE USING gist (
      "practitioner_id" WITH =,
      tstzrange("starts_at", "ends_at", '[)') WITH &&
    )
    WHERE (
      "practitioner_id" IS NOT NULL
      AND "starts_at" IS NOT NULL
      AND "ends_at" IS NOT NULL
      AND "status" IN ('requested', 'held', 'pendingPayment', 'confirmed')
    );`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_no_overlap";
  ALTER TABLE "bookings" DROP CONSTRAINT IF EXISTS "bookings_ends_after_start";`)
}
