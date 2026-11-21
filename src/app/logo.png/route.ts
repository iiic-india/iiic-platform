import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// docs/12 §6: every route handler declares its runtime and its time limit.
export const runtime = 'nodejs'
export const maxDuration = 10

/**
 * /logo.png (plan A5, A6): the kit's logo at one address that never changes, for the logo in
 * the structured data (D-62). There is no public/ folder, and a build asset's address changes
 * with every build. Served from the platform domain itself, never from the media bucket, so a
 * bot rule on another host cannot hide it.
 */
export async function GET(): Promise<Response> {
  const logo = await readFile(join(process.cwd(), 'src/brand/logo/png/logo-1200.png'))
  return new Response(new Uint8Array(logo), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400',
    },
  })
}
