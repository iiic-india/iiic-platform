import type { MetadataRoute } from 'next'

import icon192 from '@/brand/logo/png/icon-192.png'
import icon512 from '@/brand/logo/png/icon-512.png'
import iconMaskable from '@/brand/logo/png/icon-maskable-512.png'
import { SITE_LANGUAGE, SITE_NAME } from '@/lib/seo/site'

/**
 * /manifest.webmanifest (docs/02, R1; plan A6): the kit's site.webmanifest
 * (src/brand/logo/site.webmanifest) as it is, with the icons at the addresses the build gives
 * them.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: SITE_NAME,
    short_name: 'IIIC',
    description:
      'Subjective Self: consultancy, education and counselling from the Indian Institute of Image Catalysts, Ahmedabad.',
    lang: SITE_LANGUAGE,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: '#FFDD00',
    background_color: '#F8F6F0',
    icons: [
      { src: icon192.src, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: icon512.src, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: iconMaskable.src, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
