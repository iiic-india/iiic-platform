# IIIC platform

The website and back office for the Indian Institute of Image Catalysts: Next.js 16 (App Router, TypeScript strict) with Payload 3.94 inside it, Postgres on Supabase (Mumbai), deployed on Vercel (`bom1`). The product and technical source of truth is `docs/` (start with `docs/README.md`); working rules for Claude Code are in `CLAUDE.md`; the brand kit is `src/brand/` and is read-only.

## Run it locally

Needs Node 24 (`.nvmrc`), pnpm 10 and Docker. The same commands work in PowerShell on Windows, with Docker Desktop running.

```sh
docker compose up -d              # Postgres 17 on localhost:5432 (database "iiic")
cp .env.example .env              # then set PAYLOAD_SECRET in .env to the output of the next line
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
pnpm install
pnpm migrate                      # apply the migrations in src/migrations
pnpm dev                          # http://localhost:3000 and http://localhost:3000/admin
```

Every staff account sets up an authenticator app at its first sign-in and enters a code each time after (two-factor is mandatory, docs/08 §9). The first account created at `/admin` becomes the owner. Under `pnpm dev` and on previews that screen is open. On any production server it works only after the owner setup link (D-41):

1. Make a token that is safe in a link (letters, digits, `-` and `_` only): `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.
2. On Vercel, add it as `OWNER_SETUP_TOKEN` for Production and redeploy. For a local production build (`pnpm build && pnpm start`), put it in `.env` instead.
3. Open `/api/owner-setup?token=<value>` on that server and create the account within ten minutes.
4. Delete the variable.

## Commands

| Task                                           | Command                                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Develop                                        | `pnpm dev`                                                                                  |
| Build and run the production build             | `pnpm build && pnpm start`                                                                  |
| Types, lint, formatting                        | `pnpm typecheck` · `pnpm lint` · `pnpm format:check` (`pnpm format` to fix)                 |
| Unit tests                                     | `pnpm test:unit`                                                                            |
| Integration tests (real Postgres)              | `pnpm test:int`                                                                             |
| End-to-end tests (desktop and phone, with axe) | `pnpm test:e2e` (uses the dev server, or `PLAYWRIGHT_BASE_URL`)                             |
| Payload types and admin import map             | `pnpm generate:types` · `pnpm generate:importmap`                                           |
| Migrations                                     | `pnpm migrate:create <name>` after a schema change · `pnpm migrate` · `pnpm migrate:status` |

Schema changes always go through a migration (`push` is off everywhere). Migrations run over `DATABASE_URL_DIRECT` when it is set and over `DATABASE_URL` otherwise. On Supabase, `DATABASE_URL_DIRECT` is the session pooler (port 5432) and `DATABASE_URL` the transaction pooler (port 6543); the direct connection (`db.<ref>.supabase.co`) is IPv6-only and does not work from Vercel.

## Deploy

Vercel builds every pull request as a protected preview and `main` as production. The build command (`vercel.json`) runs `pnpm migrate && pnpm build`, so each deployment migrates its own database first: previews use the preview Supabase project, production the production one (`docs/07`, Environments). Environment variables live in Vercel only; `.env.example` lists every one.
