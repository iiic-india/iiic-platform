import 'server-only'

import type { PayloadRequest, Where } from 'payload'
import { z } from 'zod'

import { recordAudit } from '@/lib/audit/record'
import { env, type ServerEnv } from '@/lib/env'
import { enterCodeAgain } from '@/lib/privacy/stepUp'
import { err, ok, type Result } from '@/lib/result'
import { formatIstDate, formatIstTime } from '@/lib/time/ist'

import type { ViewError } from './contract'
import { asUser, isDay, periodRange, refused } from './shared'

/**
 * Settings (docs/05, Settings; docs/18 §6): the ways to the settings that live elsewhere, which
 * integrations are configured (their names, never a value), the flags, and the audit log with
 * filters and a CSV for an owner who enters their two-factor code again (docs/08 §9). Asks
 * `viewRefusal(user, 'settings')` first, owners only.
 */

/** Whether each integration has what it needs: names only, never a value (docs/18 §6). */
export function integrationStates(
  config: Partial<ServerEnv>,
): { name: string; configured: boolean }[] {
  const all = (...values: unknown[]) => values.every((value) => Boolean(value))
  return [
    {
      name: 'Payments (Razorpay)',
      configured: all(
        config.RAZORPAY_KEY_ID,
        config.RAZORPAY_KEY_SECRET,
        config.RAZORPAY_WEBHOOK_SECRET,
      ),
    },
    { name: 'Email (Resend)', configured: all(config.RESEND_API_KEY) },
    {
      name: 'Calendars (Google Workspace)',
      configured: all(
        config.GOOGLE_WORKSPACE_DOMAIN,
        config.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        config.GOOGLE_SERVICE_ACCOUNT_KEY,
      ),
    },
    {
      name: 'Invoices (Zoho Books)',
      configured: all(
        config.ZOHO_BOOKS_ORGANIZATION_ID,
        config.ZOHO_CLIENT_ID,
        config.ZOHO_CLIENT_SECRET,
        config.ZOHO_REFRESH_TOKEN,
      ),
    },
    {
      name: 'Spam check on forms (Cloudflare Turnstile)',
      configured: all(config.TURNSTILE_SITE_KEY, config.TURNSTILE_SECRET_KEY),
    },
    {
      name: 'Media storage (Cloudflare R2)',
      configured: all(config.R2_ACCOUNT_ID, config.R2_ACCESS_KEY_ID, config.R2_SECRET_ACCESS_KEY),
    },
    {
      name: 'Private documents bucket (certificates, exports)',
      configured: all(config.R2_ACCOUNT_ID, config.R2_BUCKET_PRIVATE),
    },
    { name: 'Session notes key', configured: all(config.NOTES_ENCRYPTION_KEY) },
    { name: 'Error reports (Sentry)', configured: all(config.SENTRY_DSN) },
  ]
}

const FLAG_LABELS = [
  { key: 'pricesPublic', label: 'Prices are public' },
  { key: 'payAtBooking', label: 'Payment at booking' },
  { key: 'mapEnabled', label: 'The Map' },
  { key: 'accountsEnabled', label: 'My IIIC accounts' },
  { key: 'bridgesEnabled', label: 'Related programmes' },
] as const

/** The audit log's filter, from the view's query string; anything malformed is dropped. */
export const auditFilter = z.object({
  entity: z
    .string()
    .regex(/^[a-z0-9-]{1,60}$/)
    .optional()
    .catch(undefined),
  action: z
    .string()
    .regex(/^[a-z0-9-]{1,60}$/)
    .optional()
    .catch(undefined),
  from: z.string().refine(isDay).optional().catch(undefined),
  to: z.string().refine(isDay).optional().catch(undefined),
})
export type AuditFilter = z.infer<typeof auditFilter>

export function readAuditFilter(params: Record<string, string | string[] | undefined> = {}) {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)
  return auditFilter.parse({
    entity: first(params.entity) || undefined,
    action: first(params.action) || undefined,
    from: first(params.from) || undefined,
    to: first(params.to) || undefined,
  })
}

export function auditWhere(filter: AuditFilter): Where {
  const and: Where[] = []
  if (filter.entity) and.push({ entity: { equals: filter.entity } })
  if (filter.action) and.push({ action: { equals: filter.action } })
  if (filter.from || filter.to) {
    const range = periodRange(filter.from ?? '2026-01-01', filter.to ?? filter.from ?? '2099-12-31')
    and.push({ at: { greater_than_equal: range.gte } }, { at: { less_than: range.lt } })
  }
  return and.length ? { and } : {}
}

export type AuditRow = {
  id: number
  at: string
  actor: string
  action: string
  entity: string
  entityId: string
  changed: string
}

export type SettingsData = {
  links: { label: string; href: string }[]
  integrations: { name: string; configured: boolean }[]
  flags: { label: string; on: boolean }[]
  audit: { filter: AuditFilter; rows: AuditRow[]; total: number }
}

/** How many audit entries the view lists at once, newest first. */
export const AUDIT_LIMIT = 50

/** The most entries one CSV holds. */
export const AUDIT_CSV_LIMIT = 5000

type AuditDoc = {
  id: number
  at: string
  actorEmail?: string | null
  actorId?: string | null
  action: string
  entity: string
  entityId?: string | null
  changed?: string | null
}

const rowOf = (doc: AuditDoc): AuditRow => ({
  id: doc.id,
  at: doc.at,
  actor: doc.actorEmail ?? (doc.actorId ? `User ${doc.actorId}` : 'The system'),
  action: doc.action,
  entity: doc.entity,
  entityId: doc.entityId ?? '',
  changed: doc.changed ?? '',
})

export async function loadSettings(
  req: PayloadRequest,
  filter: AuditFilter,
): Promise<Result<SettingsData, ViewError>> {
  const refusal = refused(req, 'settings')
  if (refusal) return refusal
  const admin = req.payload.config.routes.admin
  const user = asUser(req)
  const settings = (await req.payload
    .findGlobal({ slug: 'settings', depth: 0, ...user })
    .catch(() => null)) as { flags?: Record<string, boolean | null | undefined> } | null
  const audit = await req.payload.find({
    collection: 'audit-log',
    where: auditWhere(filter),
    sort: '-at',
    limit: AUDIT_LIMIT,
    depth: 0,
    ...user,
  })
  return ok({
    links: [
      {
        label: 'Platform settings: legal details, booking, money, flags',
        href: `${admin}/globals/settings`,
      },
      { label: 'Services, their prices and booking rules', href: `${admin}/collections/services` },
      { label: 'Working hours', href: `${admin}/working-hours` },
      { label: 'Staff accounts', href: `${admin}/collections/users` },
      { label: 'The audit log, every entry', href: `${admin}/collections/audit-log` },
    ],
    integrations: integrationStates(env()),
    flags: FLAG_LABELS.map(({ key, label }) => ({ label, on: settings?.flags?.[key] === true })),
    audit: {
      filter,
      total: audit.totalDocs,
      rows: audit.docs.map((doc) => rowOf(doc as unknown as AuditDoc)),
    },
  })
}

/** One CSV cell: quoted, and never read as a formula by a spreadsheet. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return `"${safe.replaceAll('"', '""')}"`
}

export function auditCsv(rows: AuditRow[]): string {
  const head = ['Time (India)', 'Who', 'Action', 'Collection', 'Record', 'Fields changed']
  const lines = rows.map((row) => {
    const at = new Date(row.at)
    return [
      `${formatIstDate(at)} ${formatIstTime(at)}`,
      row.actor,
      row.action,
      row.entity,
      row.entityId,
      row.changed,
    ]
      .map(csvCell)
      .join(',')
  })
  return [head.map(csvCell).join(','), ...lines].join('\r\n')
}

export type AuditExportError = ViewError | { code: 'wrong-code' } | { code: 'locked' }

/**
 * The audit log as a CSV (docs/18 §6): an owner, with the code entered again in the same request
 * (src/lib/privacy/stepUp.ts; a wrong code counts towards the lockout). The export itself is in
 * the log as `export-audit-log` before the file is handed back; if that entry fails, no file
 * leaves. The addresses the log keeps are left out of the file.
 */
export async function exportAuditCsv(
  req: PayloadRequest,
  body: unknown,
): Promise<Result<{ csv: string; filename: string }, AuditExportError>> {
  const refusal = refused(req, 'settings')
  if (refusal) return refusal
  const input = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const stepped = await enterCodeAgain(req, input.code)
  if (!stepped.ok) return err(stepped.error)
  const filter = auditFilter.parse({
    entity: input.entity || undefined,
    action: input.action || undefined,
    from: input.from || undefined,
    to: input.to || undefined,
  })
  const { docs } = await req.payload.find({
    collection: 'audit-log',
    where: auditWhere(filter),
    sort: '-at',
    limit: AUDIT_CSV_LIMIT,
    depth: 0,
    ...asUser(req),
  })
  await recordAudit(req, { action: 'export-audit-log', entity: 'audit-log' })
  return ok({
    csv: auditCsv(docs.map((doc) => rowOf(doc as unknown as AuditDoc))),
    filename: `iiic-audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
  })
}
