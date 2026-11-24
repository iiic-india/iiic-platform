import { reportError } from './sentry'

/** What staff read when a route fails on the server's side (src/brand/VOICE.md, errors). */
export const ROUTE_FAULT_MESSAGE = 'That did not work on our side. Reload the page and try again.'

/**
 * A route handler whose faults are logged and reported by their name only (docs/12 §6, Logs; M7
 * security review). Left to Next.js, a fault is logged whole, and a failed query's error carries
 * the values it was given: a printed name, a reason typed by staff. The answer is a plain 500
 * that is never cached; Sentry gets the error through its scrubbing (src/lib/monitoring/scrub.ts).
 */
export function answeringFaults<A extends unknown[]>(
  task: string,
  handler: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args) => {
    try {
      return await handler(...args)
    } catch (error) {
      console.error(`${task} failed (${error instanceof Error ? error.name : 'unknown error'}).`)
      void reportError(error, { task })
      return Response.json(
        { code: 'failed', message: ROUTE_FAULT_MESSAGE },
        { status: 500, headers: { 'Cache-Control': 'private, no-store' } },
      )
    }
  }
}
