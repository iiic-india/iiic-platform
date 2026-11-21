import { getLegalInformation } from '@/lib/settings/read'

import { SiteFooter } from './SiteFooter'

/**
 * The footer with the legal information the settings hold, read on the server and cached by the
 * settings' tag, so an owner's change shows at the next request (src/lib/settings/read.ts).
 */
export async function SiteFooterWithSettings() {
  return <SiteFooter legal={await getLegalInformation()} />
}
