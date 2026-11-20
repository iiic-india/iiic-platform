import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The audit log is append-only in the database itself, not only in Payload (docs/12 §5, D-43).
 * Written by hand: Payload generates tables, not triggers. A trigger refuses every UPDATE,
 * DELETE and TRUNCATE on audit_log, whoever connects. Once the app has its own role (D-43, set up
 * with the split of the preview database), that role also loses those rights, so a trigger
 * dropped by mistake still leaves the log closed to the app.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE OR REPLACE FUNCTION "audit_log_refuse_change"() RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    RAISE EXCEPTION 'The audit log is append-only: entries cannot be changed or deleted.';
  END;
  $$;
  CREATE TRIGGER "audit_log_append_only" BEFORE UPDATE OR DELETE ON "audit_log"
    FOR EACH ROW EXECUTE FUNCTION "audit_log_refuse_change"();
  CREATE TRIGGER "audit_log_no_truncate" BEFORE TRUNCATE ON "audit_log"
    FOR EACH STATEMENT EXECUTE FUNCTION "audit_log_refuse_change"();
  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'iiic_app') THEN
      REVOKE UPDATE, DELETE, TRUNCATE ON "audit_log" FROM "iiic_app";
    END IF;
  END
  $$;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP TRIGGER IF EXISTS "audit_log_no_truncate" ON "audit_log";
  DROP TRIGGER IF EXISTS "audit_log_append_only" ON "audit_log";
  DROP FUNCTION IF EXISTS "audit_log_refuse_change"();`)
}
