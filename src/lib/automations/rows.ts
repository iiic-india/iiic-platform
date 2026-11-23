import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import type { PayloadRequest } from 'payload'

import { AUTOMATION_IDS, type AutomationId } from './catalogue'

/**
 * Each automation's row (docs/04 `automations`; docs/05 Messages → Automations): its switch, when
 * it last ran, and how often it succeeded and failed. A row is made the first time the core needs
 * it, switched on; the trigger and timing stay the catalogue's. Counters move by one statement,
 * so two runners never lose a count.
 */

async function rowOf(req: PayloadRequest, id: AutomationId) {
  const { docs } = await req.payload.find({
    collection: 'automations',
    where: { key: { equals: id } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
    req,
  })
  return docs[0] ?? null
}

/** The row, made switched on when there is none yet. */
export async function ensureAutomationRow(req: PayloadRequest, id: AutomationId) {
  const found = await rowOf(req, id)
  if (found) return found
  try {
    return await req.payload.create({
      collection: 'automations',
      data: { key: id, enabled: true },
      overrideAccess: true,
      req,
    })
  } catch (error) {
    // Made by another runner at the same moment (the key is unique).
    const again = await rowOf(req, id).catch(() => null)
    if (again) return again
    throw error
  }
}

/** Makes every catalogue automation's row that is missing; returns how many it made. */
export async function ensureAutomationRows(req: PayloadRequest): Promise<number> {
  const { docs } = await req.payload.find({
    collection: 'automations',
    pagination: false,
    depth: 0,
    select: { key: true },
    overrideAccess: true,
    req,
  })
  const have = new Set(docs.map((doc) => doc.key))
  let made = 0
  for (const id of AUTOMATION_IDS) {
    if (have.has(id)) continue
    await ensureAutomationRow(req, id)
    made += 1
  }
  return made
}

/** Whether the automation is switched on (a missing row is: rows start on). */
export async function automationEnabled(req: PayloadRequest, id: AutomationId): Promise<boolean> {
  const found = await rowOf(req, id)
  return found ? found.enabled !== false : true
}

/** Counts one outcome and stamps the run. */
export async function countOutcome(
  req: PayloadRequest,
  id: AutomationId,
  outcome: 'success' | 'failure',
  at: Date,
): Promise<void> {
  await ensureAutomationRow(req, id)
  const column = outcome === 'success' ? sql`"success_count"` : sql`"failure_count"`
  const transactionID = await req.transactionID
  const session =
    transactionID !== undefined && transactionID !== null
      ? req.payload.db.sessions?.[transactionID]?.db
      : undefined
  const db = (session ?? req.payload.db.drizzle) as unknown as {
    execute: (query: ReturnType<typeof sql>) => Promise<unknown>
  }
  await db.execute(
    sql`UPDATE "automations" SET ${column} = COALESCE(${column}, 0) + 1,
      "last_run_at" = ${at.toISOString()}, "updated_at" = ${at.toISOString()}
      WHERE "key" = ${id}`,
  )
}
