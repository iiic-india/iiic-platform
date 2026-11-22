import { previewing } from '@/lib/preview/session'

import { LivePreview } from './LivePreview'

/**
 * The preview's notice and refresher, for staff who are previewing (src/lib/preview/session.ts),
 * and nothing at all for anyone else: a visitor's page carries no preview code.
 */
export async function Preview() {
  return (await previewing()) ? <LivePreview /> : null
}
