import { connection } from 'next/server'

import { securityTxt } from '@/lib/security/securityTxt'

// docs/12 §6: every route handler declares its runtime and its time limit.
export const runtime = 'nodejs'
export const maxDuration = 10

/**
 * /.well-known/security.txt (RFC 9116; docs/11 §5.5): generated per request, so its expiry is
 * always a year ahead (src/lib/security/securityTxt.ts), and kept at the edge for a day
 * (docs/12 §1). RFC 9116 asks for text/plain in UTF-8.
 */
export async function GET(): Promise<Response> {
  await connection()
  return new Response(securityTxt(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400',
    },
  })
}
