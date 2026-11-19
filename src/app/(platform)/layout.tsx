import '@/brand/dist/iiic.min.css'

import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'

import { env } from '@/lib/env'

import { fraunces, manrope } from '../fonts'

export const metadata: Metadata = {
  // The configured origin, else production's alias, else this deployment's URL.
  metadataBase: new URL(env().siteUrl),
  title: {
    // docs/12 §3.
    default: 'Indian Institute of Image Catalysts · Subjective Self',
    template: '%s · IIIC',
  },
  // IIIC's own words (content/sources/iiic-philosophy-2026-11-19.md), without "(IIIC)" so
  // the description stays within 155 characters (docs/12 §3).
  description:
    'The Indian Institute of Image Catalysts operates across three distinct service verticals: Education, Counselling, and Business & Management Consultancy.',
  applicationName: 'IIIC',
}

export const viewport: Viewport = {
  themeColor: '#FFDD00',
  colorScheme: 'only light',
}

export default function PlatformRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" className={`${manrope.variable} ${fraunces.variable}`}>
      <body>{children}</body>
    </html>
  )
}
