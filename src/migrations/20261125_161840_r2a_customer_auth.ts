import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Better Auth's tables for customer sign-in (Release 2; docs/20 §3.3, §15): the `customer_auth`
 * schema and its four tables, as Better Auth 1.7.27 itself prints them for the platform's options
 * (src/scripts/print-customer-auth-sql.ts; `getMigrations(options).compileMigrations()` on an empty
 * database), never typed by hand: `users` (the proven email or mobile), `sessions` (token, expiry,
 * browser; the IP column stays empty, `disableIpTracking`), `identities` (Better Auth's "account"
 * table: no passwords, and nothing in it until a sign-in through another provider is added) and
 * `verifications` (codes, hashed, under hashed identifiers). Written by hand, as the audit log's
 * trigger (D-43) and `bookings_no_overlap` (D-84) are: Payload generates only its own schema, and
 * its migrations never see this one. It was created blank with
 * `pnpm migrate:create r2a_customer_auth --force-accept-warning` right after the generated
 * `r2a_accounts`, and its up and down were copied unchanged from the file slice A staged. It is
 * never edited: a change is a new migration, and tests/int/accountsAuthSchema.int.spec.ts fails
 * until there is one.
 *
 * Then the grants (D-43): nothing for PUBLIC; the app's own role, once it exists, may use the
 * schema and read and write its tables. Supabase's Data API exposes no new schema unless asked
 * (docs/12 §5), so these tables stay off it. The grants happen only if `iiic_app` exists when this
 * runs. Nothing in the repository creates that role, so whoever creates it later grants it what
 * docs/runbook.md lists; a grant on all tables covers only the tables that exist, so a table
 * Better Auth adds later needs a grant of its own.
 *
 * Only the schema statement, the revoke and the grants can run twice. The down drops the schema
 * with every customer's sign-in user and session. `migrate:fresh` drops only `public`, so it is
 * never used on a database that has run this file.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  create schema if not exists "customer_auth";

  create table "customer_auth"."users" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" boolean not null, "image" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null, "phoneNumber" text unique, "phoneNumberVerified" boolean);

  create table "customer_auth"."sessions" ("id" text not null primary key, "expiresAt" timestamptz not null, "token" text not null unique, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text, "userId" text not null references "customer_auth"."users" ("id") on delete cascade);

  create table "customer_auth"."identities" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "customer_auth"."users" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null);

  create table "customer_auth"."verifications" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);

  create index "sessions_userId_idx" on "customer_auth"."sessions" ("userId");

  create index "identities_userId_idx" on "customer_auth"."identities" ("userId");

  create index "verifications_identifier_idx" on "customer_auth"."verifications" ("identifier");

  REVOKE ALL ON SCHEMA "customer_auth" FROM PUBLIC;
  DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'iiic_app') THEN
      GRANT USAGE ON SCHEMA "customer_auth" TO "iiic_app";
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "customer_auth" TO "iiic_app";
    END IF;
  END
  $$;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  DROP SCHEMA IF EXISTS "customer_auth" CASCADE;`)
}
