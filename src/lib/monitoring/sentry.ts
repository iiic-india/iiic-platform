import * as Sentry from '@sentry/nextjs'
import type { Config, PayloadHandler } from 'payload'

import { hasRole } from '@/access/roles'
import { env } from '@/lib/env'

import { scrubEvent } from './scrub'

/**
 * Error reporting through Sentry (docs/12 §7), on the server only: its browser script would take
 * the public pages past their JavaScript budget (D-49). Errors only: no performance traces, no
 * session replay. Sentry 11 collects request data, query values and local variables unless told
 * otherwise, so every category is switched off here, and each report still passes through the
 * scrubber. Off without a DSN (development and CI).
 */
export function startMonitoring(): void {
  const config = env()
  if (!config.sentryDsn) return
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.VERCEL_ENV ?? config.NODE_ENV,
    release: config.VERCEL_GIT_COMMIT_SHA,
    // No tracesSampleRate: leaving it unset is what keeps tracing off.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      mcp: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    beforeBreadcrumb: () => null,
    beforeSend: (event) => scrubEvent(event),
  })
}

type Tags = Record<string, string | undefined>

/**
 * Sends one error and waits for it to leave, because a serverless function can be frozen as soon
 * as it has answered. False when reporting is off.
 */
export async function reportError(error: unknown, tags: Tags = {}): Promise<boolean> {
  if (!Sentry.getClient()) return false
  Sentry.captureException(error, { tags })
  return Sentry.flush(2000)
}

type AfterError = NonNullable<NonNullable<Config['hooks']>['afterError']>[number]

/**
 * Payload answers the errors of its own API, so Next.js never sees them: the server's faults
 * (5xx) are reported from here, with the collection and the staff role as tags and nothing else
 * about the person. Payload's own plugin for this is built on an older Sentry that does not
 * support Next.js 16, and sends the user's email by default.
 */
export const reportServerError: AfterError = async ({ error, collection, req }) => {
  const status = (error as { status?: number }).status ?? 500
  if (status < 500) return
  const roles = (req.user as { roles?: string[] } | null)?.roles
  await reportError(error, { collection: collection?.slug, role: roles?.join(',') })
}

const json = (body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/**
 * POST /api/report-test-error: an owner who has entered their code sends a test error, to
 * check that reports and alerts arrive (docs/12 §7). Nothing else happens.
 */
export const reportTestError: PayloadHandler = async (req) => {
  const actor = req.user
  const strategy = (actor as { _strategy?: string } | null)?._strategy
  if (!actor || actor.collection !== 'users' || strategy !== 'totp') {
    return json({ message: 'Sign in with your code to do this.' }, 401)
  }
  if (!hasRole(actor, 'owner')) {
    return json({ message: 'Only an owner can send a test error.' }, 403)
  }
  const sent = await reportError(new Error('Test error from the admin: error reporting works.'), {
    role: 'owner',
    test: 'true',
  })
  return sent
    ? json({ ok: true })
    : json(
        { message: 'Error reporting is not switched on here, or the report did not leave.' },
        503,
      )
}
