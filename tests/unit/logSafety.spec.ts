// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LOGGER_OPTIONS, logSafeError } from '@/lib/monitoring/logSafety'
import { answeringFaults, ROUTE_FAULT_MESSAGE } from '@/lib/monitoring/routeFaults'
import { scrubText } from '@/lib/monitoring/scrub'

// What the server's logs may hold about an error (docs/12 §6; CLAUDE.md, Logs; M7 security
// review): a failed query's values, a person's email or phone number and a token never reach a
// log line, whether Payload logs the error or a route lets it go. Every value here is fake.

const EMAIL = 'client.test@example.invalid'
const PHONE = '+919876543210'

/** A failed insert as drizzle-orm reports one, with Postgres's error as its cause. */
function failedQuery(): Error {
  const cause = Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505',
    detail: `Key (email)=(${EMAIL}) already exists.`,
  })
  const error = new Error(
    `Failed query: insert into "people" ("full_name", "email", "mobile") values ($1, $2, $3)\nparams: Test Client (fake),${EMAIL},${PHONE}`,
    { cause },
  )
  error.name = 'DrizzleQueryError'
  return Object.assign(error, { params: ['Test Client (fake)', EMAIL, PHONE] })
}

afterEach(() => vi.restoreAllMocks())

describe('an error as the logs hold it', () => {
  it('keeps the name, the code, a scrubbed message and the frames, and nothing else', () => {
    const logged = logSafeError(failedQuery())
    const text = JSON.stringify(logged)
    expect(logged.type).toBe('DrizzleQueryError')
    expect(logged.message).toContain('Failed query: insert into "people"')
    expect(logged.message).toContain('params: [removed]')
    expect(logged.cause).toMatchObject({ type: 'Error', code: '23505' })
    for (const value of [EMAIL, PHONE, 'Test Client (fake)', 'already exists.']) {
      expect(text).not.toContain(value)
    }
    expect(logged.stack ?? '').not.toContain('params:')
    expect(logged.stack ?? '').toMatch(/^\s+at /)
  })

  it('stops following causes two levels down, and copes with what is not an error', () => {
    const deep = new Error('one', { cause: new Error('two', { cause: new Error('three') }) })
    expect(logSafeError(deep).cause?.cause?.cause).toBeUndefined()
    expect(logSafeError(`call ${PHONE}`)).toEqual({ type: 'string', message: 'call [phone]' })
    expect(logSafeError(null)).toEqual({ type: 'object', message: 'null' })
  })

  it('is Payload’s serializer for every error it logs', () => {
    expect(LOGGER_OPTIONS.serializers.err).toBe(logSafeError)
    expect(LOGGER_OPTIONS.serializers.error).toBe(logSafeError)
  })
})

describe('a route’s fault', () => {
  it('is logged by its name only and answered with a plain 500 that is never cached', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const route = answeringFaults('Issuing certificates', async () => {
      throw failedQuery()
    })
    const response = await route()
    expect(response.status).toBe(500)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ code: 'failed', message: ROUTE_FAULT_MESSAGE })
    expect(logged).toHaveBeenCalledWith('Issuing certificates failed (DrizzleQueryError).')
    expect(JSON.stringify(logged.mock.calls)).not.toContain(EMAIL)
  })

  it('passes an answer through untouched', async () => {
    const route = answeringFaults('Downloading an invoice', async (id: string) =>
      Response.json({ id }),
    )
    expect(await (await route('7')).json()).toEqual({ id: '7' })
  })
})

describe('a calendar feed’s address', () => {
  it('loses its token in an error report, as the other keyed addresses do', () => {
    expect(scrubText('/api/calendar/feed/AbCdEfGhIjKlMnOpQrStUv')).toBe(
      '/api/calendar/feed/[token]',
    )
  })
})
