import type { Endpoint, PayloadHandler } from 'payload'

import { viewRefusal } from '@/access/views'

/**
 * The views' one route of their own (M5 C; docs/18 §6): the audit log as a CSV, for an owner who
 * enters their two-factor code again. It checks the user, the role and the code first
 * (src/lib/adminViews/settings.ts), before it reads the body's filter. The module that reads the
 * database is `server-only`, which the Payload CLI cannot load, so it is loaded on the first call.
 * Never cached.
 */

const STATUS: Record<string, number> = {
  invalid: 400,
  'wrong-code': 403,
  locked: 403,
}

const json = (body: Record<string, unknown>, status: number) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const MESSAGES: Record<string, string> = {
  'sign-in': 'Sign in to continue.',
  'enter-code': 'Enter your two-factor code first.',
  'not-allowed': 'Only an owner can export the audit log.',
  'wrong-code': 'That code did not match. Enter the current code from your authenticator app.',
  locked: 'This account is locked for a while after too many attempts. Try again later.',
  invalid: 'Check the filter and try again.',
}

export const auditCsvHandler: PayloadHandler = async (req) => {
  // An owner with the code, before the body is read (CLAUDE.md #6); exportAuditCsv asks again.
  const refusal = viewRefusal(req.user, 'settings')
  if (refusal) {
    return json({ code: refusal.code, message: MESSAGES[refusal.code] }, refusal.status)
  }
  const { exportAuditCsv } = await import('./settings')
  const body = await req.json?.().catch(() => null)
  const result = await exportAuditCsv(req, body)
  if (!result.ok) {
    const error = result.error
    if (error.code === 'refused') {
      return json(
        { code: error.refusal.code, message: MESSAGES[error.refusal.code] },
        error.refusal.status,
      )
    }
    return json(
      { code: error.code, message: MESSAGES[error.code] ?? MESSAGES.invalid },
      STATUS[error.code] ?? 400,
    )
  }
  return new Response(result.value.csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${result.value.filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

export const adminViewEndpoints: Endpoint[] = [
  { path: '/admin-views/audit-log-csv', method: 'post', handler: auditCsvHandler },
]
