import { z } from 'zod'

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
 * comes in the body of a POST, never in an address, because the request log keeps addresses
 * and the privacy notice says this question stores nothing. Anything that is not one of the
 * three answers, or a body that is not a form, goes back to the question. The address it sends
 * to is always one of this site's own paths, never taken from the request. Nothing is stored;
 * the anonymous count of each choice (F1, step 3) joins this handler with the analytics events
 * (M2).
 */
export async function POST(request: Request): Promise<Response> {
  const form = await request.formData().catch(() => null)
  const parsed = Answer.safeParse({ who: form?.get('who') })
  const door = parsed.success ? doorFor(parsed.data.who) : null
  return sendTo(door ?? '/map')
}

/** An address never carries the answer: a GET, whatever its query, goes back to the question. */
export function GET(): Response {
  return sendTo('/map')
}
