import { z } from 'zod'

import { doorFor, WHO_FOR } from '@/lib/map/stepZero'

const Answer = z.object({ who: z.enum(WHO_FOR) })

/**
 * Where "Find your path" sends its one answer (docs/03 F1): to the visitor's door. An answer
 * that is not one of the three goes back to the question. The address it sends to is always
 * one of this site's own paths, never taken from the request. Nothing is stored; the anonymous
 * count of each choice (F1, step 3) joins this handler with the analytics events (M2).
 */
export function GET(request: Request): Response {
  const parsed = Answer.safeParse({ who: new URL(request.url).searchParams.get('who') })
  const door = parsed.success ? doorFor(parsed.data.who) : null
  return new Response(null, {
    status: 303,
    headers: { Location: door ?? '/map', 'Cache-Control': 'no-store' },
  })
}
