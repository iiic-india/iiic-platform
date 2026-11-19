# IIIC platform

The website and back office for the Indian Institute of Image Catalysts: Next.js 16 (App Router, TypeScript strict) with Payload 3.94 inside it, Postgres on Supabase (Mumbai), deployed on Vercel (`bom1`). The product and technical source of truth is `docs/` (start with `docs/README.md`); working rules for Claude Code are in `CLAUDE.md`; the brand kit is `src/brand/` and is read-only.

## Run it locally

Needs Node 24 (`.nvmrc`), pnpm 10 and Docker.

```sh
docker compose up -d              # Postgres 17 on localhost:5432 (database "iiic")
cp .env.example .env              # then set PAYLOAD_SECRET: openssl rand -base64 48
pnpm install
pnpm migrate                      # apply the migrations in src/migrations
pnpm dev                          # http://localhost:3000 and http://localhost:3000/admin
```

The first account created at `/admin` becomes the owner.

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

Schema changes always go through a migration (`push` is off everywhere). Migrations run over `DATABASE_URL_DIRECT` when it is set (Supabase's direct connection) and over `DATABASE_URL` otherwise.

## Deploy

Vercel builds every pull request as a protected preview and `main` as production. The build command (`vercel.json`) runs `pnpm migrate && pnpm build`, so each deployment migrates its own database first: previews use the preview Supabase project, production the production one (`docs/07`, Environments). Environment variables live in Vercel only; `.env.example` lists every one.
