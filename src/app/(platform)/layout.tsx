import '@/brand/dist/iiic.min.css'

import type { Metadata, Viewport } from 'next'
import { connection } from 'next/server'
import type { ReactNode } from 'react'

import appleIcon from '@/brand/logo/png/apple-touch-icon-180.png'
import { AnalyticsBeacon } from '@/components/site/AnalyticsBeacon'
import { env } from '@/lib/env'
import { SHARE_IMAGE_SIZE, shareImagePath } from '@/lib/seo/metadata'
import {
  HOME_TITLE,
  SITE_DESCRIPTION,
  SITE_LANGUAGE,
  SITE_NAME,
  TITLE_SUFFIX,
} from '@/lib/seo/site'

import { fraunces, manrope } from '../fonts'

export const metadata: Metadata = {
  // The configured origin, else production's alias, else this deployment's URL.
  metadataBase: new URL(env().siteUrl),
  title: {
    // docs/12 §3.
    default: HOME_TITLE,
    template: `%s${TITLE_SUFFIX}`,
  },
  // IIIC's own words (content/sources/iiic-philosophy-2026-11-19.md), for a page without a
  // description of its own. Each page sets its own canonical URL and share tags
  // (src/lib/seo/metadata.ts); these are what a page without them, such as the 404, carries.
  description: SITE_DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    locale: SITE_LANGUAGE.replace('-', '_'),
    images: [{ url: shareImagePath('/'), ...SHARE_IMAGE_SIZE, alt: SITE_NAME }],
  },
  twitter: { card: 'summary_large_image' },
  applicationName: 'IIIC',
  // The tab icon is IIIC's own (src/app/icon.svg, D-48). Next.js links src/app/favicon.ico by
  // itself, for browsers that take no SVG. The home-screen icon is the kit's, used as it is.
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: appleIcon.src, sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  themeColor: '#FFDD00',
  colorScheme: 'only light',
}

export default async function PlatformRootLayout({ children }: { children: ReactNode }) {
  // Every page renders per request, so that Next.js can put the CSP nonce on its scripts
  // (D-42); CMS data is cached by tag instead of the page (docs/12 §1).
  await connection()
  return (
    <html lang="en-IN" className={`${manrope.variable} ${fraunces.variable}`}>
      <body>
        {children}
        {/* Cloudflare's cookieless beacon, only where its token is set (docs/12 §7). */}
        <AnalyticsBeacon />
      </body>
    </html>
  )
}
