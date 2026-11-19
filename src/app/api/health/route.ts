import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'

import config from '@payload-config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 10

/**
 * Liveness and database reachability for UptimeRobot (docs/12 §7). Says nothing about
 * data; never cached.
 */
export async function GET() {
  const headers = { 'Cache-Control': 'no-store' }
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local'
  try {
    const payload = await getPayload({ config })
    await payload.db.drizzle.execute(sql`select 1`)
    return Response.json({ status: 'ok', database: 'ok', commit }, { headers })
  } catch {
    return Response.json(
      { status: 'degraded', database: 'unreachable', commit },
      { status: 503, headers },
    )
  }
}
