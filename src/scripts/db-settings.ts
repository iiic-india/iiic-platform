import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'

import config from '../payload.config'

/**
 * Database settings that belong to the role, not the schema (docs/12 §4). Supabase's
 * transaction pooler ignores session-level settings, so the statement timeout is set
 * on the role the app connects as and applies to every new session. Runs after the
 * migrations on every deployment (`pnpm vercel-build`) and is safe to repeat. A
 * migration that needs longer starts with `set local statement_timeout = 0`.
 */
const payload = await getPayload({ config })
await payload.db.drizzle.execute(sql`alter role current_user set statement_timeout = '15s'`)
payload.logger.info('Database role settings applied: statement_timeout 15s.')
process.exit(0)
