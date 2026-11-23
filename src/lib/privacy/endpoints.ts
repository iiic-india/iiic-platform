import 'server-only'

import type { Endpoint, PayloadHandler, PayloadRequest } from 'payload'

import { viewRefusal } from '@/access/views'
import { PRIVACY_COPY, type PrivacyErrorCode } from '@/components/admin/privacy/privacyCopy'

import { confirmErasure, planErasure } from './erasure'
import { downloadExport, exportPersonData, type ExportError } from './export'
import { enterCodeAgain, type StepUpError } from './stepUp'

/**
 * The request actions' routes under /api/privacy (docs/18 §5). Each asks `viewRefusal` first,
 * before it reads any input (CLAUDE.md #6), then the privacy module checks again and reads with
 * the user's own access. Confirming an erasure and making an export take the two-factor code in
 * the same request. Answers are never cached and never carry a person's details.
 */

const json = (body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

const STATUS: Record<Exclude<ExportError['code'] | StepUpError['code'], 'refused'>, number> = {
  invalid: 400,
  'not-found': 404,
  'not-now': 409,
  'not-verified': 409,
  'storage-missing': 503,
  'wrong-code': 400,
  locked: 423,
}

function refused(error: ExportError | StepUpError) {
  if (error.code === 'refused') {
    const message =
      PRIVACY_COPY.errors[error.refusal.code === 'sign-in' ? 'refused' : error.refusal.code]
    return json({ code: error.refusal.code, message }, error.refusal.status)
  }
  return json(
    { code: error.code, message: PRIVACY_COPY.errors[error.code as PrivacyErrorCode] },
    STATUS[error.code],
  )
}

async function body(req: PayloadRequest): Promise<Record<string, unknown>> {
  const parsed = await req.json?.().catch(() => null)
  return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
}

/** Logs only the fault's name: a failed query's message can carry values. */
const guarded =
  (what: string, handler: PayloadHandler): PayloadHandler =>
  async (req) => {
    try {
      return await handler(req)
    } catch (error) {
      req.payload.logger.error(
        `${what} failed (${error instanceof Error ? error.name : 'unknown error'}).`,
      )
      return json({ code: 'failed', message: PRIVACY_COPY.errors.failed }, 500)
    }
  }

/** The view's own check, before the body is read. */
const first = (req: PayloadRequest, view: 'privacy' | 'privacyDecision') => {
  const refusal = viewRefusal(req.user, view)
  return refusal ? refused({ code: 'refused', refusal }) : null
}

/** POST { requestId }: what an erasure deletes and keeps. */
const plan: PayloadHandler = async (req) => {
  const stop = first(req, 'privacy')
  if (stop) return stop
  const { requestId } = await body(req)
  const planned = await planErasure(req, requestId as number)
  return planned.ok ? json({ plan: planned.value }) : refused(planned.error)
}

/** POST { requestId, code }: an owner's Confirm erasure. */
const confirm: PayloadHandler = async (req) => {
  const stop = first(req, 'privacyDecision')
  if (stop) return stop
  const { requestId, code } = await body(req)
  const entered = await enterCodeAgain(req, code)
  if (!entered.ok) return refused(entered.error)
  const done = await confirmErasure(req, requestId as number)
  return done.ok ? json({ deleted: done.value.deleted }) : refused(done.error)
}

/** POST { requestId, code }: an owner makes the access export. */
const makeExport: PayloadHandler = async (req) => {
  const stop = first(req, 'privacyDecision')
  if (stop) return stop
  const { requestId, code } = await body(req)
  const entered = await enterCodeAgain(req, code)
  if (!entered.ok) return refused(entered.error)
  const made = await exportPersonData(req, requestId as number)
  return made.ok ? json({ ok: true }) : refused(made.error)
}

/** GET ?requestId=&format=json|html: the export's file, as an attachment, audited. */
const download: PayloadHandler = async (req) => {
  const stop = first(req, 'privacyDecision')
  if (stop) return stop
  const raw = req.searchParams?.get('requestId') ?? ''
  const format = req.searchParams?.get('format') === 'html' ? 'html' : 'json'
  const file = await downloadExport(req, /^\d{1,12}$/.test(raw) ? Number(raw) : raw, format)
  if (!file.ok) return refused(file.error)
  return new Response(new Uint8Array(file.value.body), {
    headers: {
      'Content-Type': file.value.contentType,
      'Content-Disposition': `attachment; filename="${file.value.filename}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

export const privacyEndpoints: Endpoint[] = [
  { path: '/privacy/erasure-plan', method: 'post', handler: guarded('Planning an erasure', plan) },
  {
    path: '/privacy/confirm-erasure',
    method: 'post',
    handler: guarded('Confirming an erasure', confirm),
  },
  { path: '/privacy/export', method: 'post', handler: guarded('Making an export', makeExport) },
  {
    path: '/privacy/export-file',
    method: 'get',
    handler: guarded('Downloading an export', download),
  },
]
