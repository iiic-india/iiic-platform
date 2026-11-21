import type { MetadataRoute } from 'next'

import { robotsFor } from '@/lib/seo/robots'

/** /robots.txt (D-61; src/lib/seo/robots.ts). The institute domain adds its own at R3. */
export default function robots(): MetadataRoute.Robots {
  return robotsFor()
}
