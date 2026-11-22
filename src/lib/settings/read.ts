import 'server-only'

import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'
import { cache } from 'react'

import config from '@payload-config'

import type { Flags } from './flags'
import type { LegalInformation } from './legal'
import { SETTINGS_TAG } from './revalidate'
import { readFlags, readLegalInformation } from './source'

/**
 * The settings the pages read, cached by the settings' tag and marked stale when an owner saves
 * them (src/globals/Settings.ts; docs/12 §1, §4), so that a page never waits for the database
 * and one request reads them once however many components ask. The cache holds only what these
 * readers return: the public legal information and the flags.
 */
export const getLegalInformation = cache(async (): Promise<LegalInformation> =>
  unstable_cache(
    async () => readLegalInformation(await getPayload({ config })),
    ['settings-legal'],
    { tags: [SETTINGS_TAG] },
  )(),
)

export const getFlags = cache(async (): Promise<Flags> =>
  unstable_cache(async () => readFlags(await getPayload({ config })), ['settings-flags'], {
    tags: [SETTINGS_TAG],
  })(),
)

/**
 * The legal information a page draws: read only for a page with the legal information section,
 * so that no other page waits on it.
 */
export async function legalInformationFor(
  layout: readonly { blockType: string }[],
): Promise<LegalInformation | undefined> {
  return layout.some((block) => block.blockType === 'legal') ? getLegalInformation() : undefined
}

/**
 * Whether prices may be shown on a page, in an email or in a template: only once the owner has
 * turned on `prices_public` (D-21). Everything that could show a price asks this first (M3).
 */
export async function pricesArePublic(): Promise<boolean> {
  return (await getFlags()).pricesPublic
}
