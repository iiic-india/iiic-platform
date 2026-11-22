import { after } from 'next/server'
import { z } from 'zod'

import { recordEventQuietly } from '@/lib/analytics/record'
import { doorFor, WHO_FOR } from '@/lib/map/stepZero'

// docs/12 §6: every route handler declares its runtime and its time limit.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 10

const Answer = z.object({ who: z.enum(WHO_FOR) })

const sendTo = (location: string): Response =>
  new Response(null, { status: 303, headers: { Location: location, 'Cache-Control': 'no-store' } })

/**
 * Where "Find your path" sends its one answer (docs/03 F1): to the visitor's door. The answer
 * comes in the body of a POST, never in an address, because the request log keeps addresses.
 * Anything that is not one of the three answers, or a body that is not a form, goes back to the
 * question. The address it sends to is always one of this site's own paths, never taken from the
 * request.
 *
 * Each answer is counted (F1, step 3): a step-0 analytics event with the choice, the page, the
 * day's pseudonymous session code and the time, and nothing about the person (docs/12 §7, §10;
 * src/lib/analytics/record.ts). It is written after the response has gone, so the visitor never
 * waits for it, and a failure to write it never changes where they are sent.
 */
export async function POST(request: Request): Promise<Response> {
  const form = await request.formData().catch(() => null)
  const parsed = Answer.safeParse({ who: form?.get('who') })
  const door = parsed.success ? doorFor(parsed.data.who) : null
  if (parsed.success && door) {
    const whoFor = parsed.data.who
    const { headers } = request
    after(() =>
      recordEventQuietly({ name: 'step0', route: '/map', register: 'default', whoFor }, headers),
    )
  }
  return sendTo(door ?? '/map')
}

/** An address never carries the answer: a GET, whatever its query, goes back to the question. */
export function GET(): Response {
  return sendTo('/map')
}
