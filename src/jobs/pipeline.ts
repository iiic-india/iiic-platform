import type { TaskConfig } from 'payload'

/**
 * The CRM's tasks (docs/17 §12, builder A), each named by its automation ID and idempotent
 * (CLAUDE.md). Their slugs join the jobs table's enum, so the merge's one migration covers them
 * (docs/17 §12). The CRM module is server-only, and the Payload CLI loads this file too, so each
 * handler imports it when it runs.
 */

// docs/06, Engine rules: three attempts with backoff, then the job fails where the team sees it.
const RETRIES = { attempts: 3, backoff: { type: 'exponential' as const, delay: 60_000 } }

/**
 * P2 · A proposal call booked creates or updates its lead, on M3's `booking.confirmed` (added to
 * LISTENERS in src/lib/booking/emit.ts at the merge). A booking that is not a proposal call is
 * not the CRM's and is left alone; a call already on a lead is not attached twice.
 */
export const leadFromCallTask: TaskConfig<{
  input: { bookingId: number }
  output: { outcome: string; leadId?: number; created?: boolean }
}> = {
  slug: 'P2-lead-from-call',
  label: 'P2 · Put a booked proposal call on its lead',
  retries: RETRIES,
  inputSchema: [{ name: 'bookingId', type: 'number', required: true }],
  outputSchema: [
    { name: 'outcome', type: 'text', required: true },
    { name: 'leadId', type: 'number' },
    { name: 'created', type: 'checkbox' },
  ],
  handler: async ({ input, req }) => {
    const { attachCall } = await import('@/lib/pipeline/core/calls')
    const result = await attachCall(req, { bookingId: input.bookingId })
    if (!result.ok) return { output: { outcome: result.error.code } }
    return { output: { outcome: 'attached', ...result.value } }
  },
}

/**
 * P3 · P4 · The first-reply clock and staleness: raises `lead.untouched` at amber and at red, and
 * `lead.stale` once per quiet spell. Run hourly by M6's cron; by an owner through the jobs API
 * until then. The board shows both at once without it.
 */
export const leadAlertsTask: TaskConfig<{
  input: object
  output: { untouched: number; stale: number }
}> = {
  slug: 'P3-P4-lead-alerts',
  label: 'P3 · P4 · Raise untouched and stale leads, once each',
  retries: RETRIES,
  outputSchema: [
    { name: 'untouched', type: 'number', required: true },
    { name: 'stale', type: 'number', required: true },
  ],
  handler: async ({ req }) => {
    const { raiseLeadAlerts } = await import('@/lib/pipeline/core/alerts')
    const raised = await raiseLeadAlerts(req, new Date())
    req.payload.logger.info({ msg: 'Lead alerts raised', ...raised })
    return { output: raised }
  },
}

export const pipelineTasks = [leadFromCallTask, leadAlertsTask]
