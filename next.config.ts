import path from 'path'
import { fileURLToPath } from 'url'

import { withPayload } from '@payloadcms/next/withPayload'
import { withSentryConfig } from '@sentry/nextjs/config'
import type { NextConfig } from 'next'

import { headerRules, withoutColorSchemeHints } from './src/lib/security/headers'

const dirname = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    localPatterns: [{ pathname: '/api/media/file/**' }],
  },
  // Security headers on every route, noindex everywhere but Vercel's production (docs/12 §5).
  // The Content-Security-Policy is set per request by src/proxy.ts.
  async headers() {
    return headerRules(process.env.VERCEL_ENV)
  },
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }
    return webpackConfig
  },
  turbopack: {
    root: path.resolve(dirname),
  },
}

const withPayloadConfig = withPayload(nextConfig, { devBundleServerPackages: false })
const payloadHeaders = withPayloadConfig.headers

const config = {
  ...withPayloadConfig,
  // Payload's colour-scheme client hints are dropped (src/lib/security/headers.ts).
  async headers() {
    return withoutColorSchemeHints((await payloadHeaders?.()) ?? [])
  },
} satisfies NextConfig

// Sentry's build step uploads no source maps: to match them it puts a debug ID in every script,
// the browser's included, and only where its token is present (Vercel), so the pages would carry
// bytes the budget check in CI never measured (D-49). With the token the build still records the
// deployment as a release. No browser script is added: reporting is server-side only.
export default withSentryConfig(config, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  telemetry: false,
  sourcemaps: { disable: true },
})
