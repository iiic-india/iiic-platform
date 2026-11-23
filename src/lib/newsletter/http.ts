import 'server-only'

import { createHash } from 'node:crypto'

import { clientAddress } from '@/lib/analytics/session'

import type { FormEvidence } from './subscriptions'

/**
 * What the newsletter's routes share (docs/19 §8): reading a small form or JSON body, the
 * answers, and the evidence a consent records. Nothing a form holds is logged.
 */

/** A form here is a few fields: anything larger is refused unread. */
export const MAX_BODY_BYTES = 8 * 1024

export const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
} as const

/** The body as plain fields, from a form post or JSON; null when it is too large or unreadable. */
export async function readFields(request: Request): Promise<Record<string, unknown> | null> {
  const length = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return null
  const type = request.headers.get('content-type') ?? ''
  try {
    const raw = await request.text()
    if (raw.length > MAX_BODY_BYTES) return null
    if (type.includes('application/json')) {
      const parsed: unknown = raw ? JSON.parse(raw) : {}
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null
    }
    return Object.fromEntries(new URLSearchParams(raw))
  } catch {
    return null
  }
}

/** Whether the caller wants JSON back (a script) rather than the next page (a plain form). */
export function wantsJson(request: Request): boolean {
  return (request.headers.get('accept') ?? '').includes('application/json')
}

/** The next page after a plain form post, on the same origin the form was served from. */
export function seeOther(request: Request, path: string): Response {
  return new Response(null, {
    status: 303,
    headers: { ...PRIVATE_HEADERS, Location: new URL(path, request.url).toString() },
  })
}

export function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: PRIVATE_HEADERS })
}

/** The limit's key: a hash of the client's address, so the address itself is never kept. */
export function clientKey(headers: Headers): string {
  return createHash('sha256')
    .update(clientAddress(headers) || 'unknown')
    .digest('hex')
    .slice(0, 32)
}

/** The evidence a consent given on a form records (docs/08 §3): the address and the browser. */
export function formEvidence(headers: Headers): FormEvidence {
  return { ip: clientAddress(headers), userAgent: headers.get('user-agent') ?? '' }
}
