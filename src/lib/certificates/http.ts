import 'server-only'

import { createPayloadRequest, type PayloadRequest } from 'payload'

import { type AdminView, viewRefusal } from '@/access/views'
import { CERTIFICATE_ANSWERS as ANSWERS } from '@/components/admin/certificates/certificatesCopy'
import config from '@payload-config'

import type { CertificateError } from './contract'

/**
 * The certificate routes' shared door (docs/18 §1, §4; CLAUDE.md #6): the request is made into a
 * Payload request, which runs the sign-in strategies (the two-factor one included), and the user,
 * an active account, the code and the role are checked before the body is read. Answers are JSON
 * in the admin's words, never cached, never indexed; nothing from the body is logged.
 */

export const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
} as const

/** 200 recipients with their printed names are a few kilobytes; far more is not a form. */
export const MAX_BODY_BYTES = 128 * 1024

export const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: PRIVATE_HEADERS })

/** The HTTP status and the admin's message for each refusal. */
export function answerFor(error: CertificateError): { status: number; message: string } {
  switch (error.code) {
    case 'refused':
      return { status: error.refusal.status, message: ANSWERS[error.refusal.code] }
    case 'invalid':
      return { status: 400, message: [ANSWERS.invalid, ...error.issues].join(' ') }
    case 'person-not-found':
      return { status: 404, message: ANSWERS['person-not-found'](error.personIds) }
    case 'not-found':
      return { status: 404, message: ANSWERS['not-found'] }
    case 'signatory-missing':
    case 'already-revoked':
      return { status: 409, message: ANSWERS[error.code] }
    case 'storage-missing':
    case 'render-failed':
      return { status: 503, message: ANSWERS[error.code] }
  }
}

export const refusalResponse = (error: CertificateError): Response => {
  const { status, message } = answerFor(error)
  return json({ code: error.code, message }, status)
}

/** The staff request behind a route, or the refusal to send instead (before any input is read). */
export async function staffRequest(
  request: Request,
  view: AdminView,
): Promise<{ ok: true; req: PayloadRequest } | { ok: false; response: Response }> {
  const req = await createPayloadRequest({ config, request })
  const refusal = viewRefusal(req.user, view)
  if (refusal) return { ok: false, response: refusalResponse({ code: 'refused', refusal }) }
  return { ok: true, req }
}

/** The JSON body, or a response saying why it cannot be read. */
export async function readJson(
  request: Request,
): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { ok: false, response: json({ code: 'too-large', message: ANSWERS.tooLarge }, 413) }
  }
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) {
    return { ok: false, response: json({ code: 'too-large', message: ANSWERS.tooLarge }, 413) }
  }
  try {
    return { ok: true, body: JSON.parse(text) as unknown }
  } catch {
    return { ok: false, response: json({ code: 'not-json', message: ANSWERS.notJson }, 400) }
  }
}

/** A form's text fields with the empty ones left out, so an optional field left blank is absent. */
export function withoutBlanks(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {}
  return Object.fromEntries(
    Object.entries(body as Record<string, unknown>).filter(
      ([, value]) => !(typeof value === 'string' && value.trim() === ''),
    ),
  )
}
