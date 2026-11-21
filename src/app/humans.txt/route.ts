import { SITE_NAME } from '@/lib/seo/site'

// docs/12 §6: every route handler declares its runtime and its time limit.
export const runtime = 'nodejs'
export const maxDuration = 10

/**
 * /humans.txt (docs/11 §5.5; plan A6): who made the site, the kit's typefaces and their
 * licences, and the signature line with its translation (D-36).
 */
const HUMANS = [
  '/* TEAM */',
  `Site: ${SITE_NAME} (IIIC), Ahmedabad, India`,
  'Built with: Claude Code',
  '',
  '/* SITE */',
  'Language: en-IN',
  'Typefaces: Fraunces (The Fraunces Project Authors) and Manrope (The Manrope Project Authors), both under the SIL Open Font License 1.1',
  'Standards: HTML, CSS, WCAG 2.2 AA',
  '',
  '/* SIGNATURE */',
  'आत्मानं विद्धि (ātmānaṃ viddhi): Know thyself.',
  '',
].join('\n')

export function GET(): Response {
  return new Response(HUMANS, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400',
    },
  })
}
