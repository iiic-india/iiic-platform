import path from 'path'
import { fileURLToPath } from 'url'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig, type EmailAdapter } from 'payload'
import { payloadTotp } from 'payload-totp'
import sharp from 'sharp'

import { Media } from './collections/Media'
import { Users } from './collections/Users'
import { TOTP_OPTIONS } from './lib/auth/totp'
import { env } from './lib/env'
import { totpCopy } from './plugins/totpCopy'
import { totpSecretAtRest } from './plugins/totpSecretAtRest'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const config = env()

// Migrations run over Supabase's session pooler (port 5432); the app uses the transaction pooler (port 6543).
// The direct connection is IPv6-only and unreachable from Vercel, so it is never used (.env.example).
const connectionString =
  process.env.PAYLOAD_MIGRATING === 'true'
    ? config.DATABASE_URL_DIRECT || config.DATABASE_URL
    : config.DATABASE_URL

// Email arrives with Resend in M6. Payload's fallback console adapter would log every
// recipient's address, so until then messages are dropped with a note that names no one.
const emailNotConfigured: EmailAdapter = ({ payload }) => ({
  name: 'not-configured',
  defaultFromAddress: 'not-configured@example.invalid',
  defaultFromName: 'IIIC',
  sendEmail: async () => {
    payload.logger.warn('Email is not configured yet (M6); the message was not sent.')
  },
})

/** One of IIIC's two-factor views (src/components/admin/), registered as payload-totp registers its own. */
const twoFactorView = (component: string, path: `/${string}`) => ({
  Component: `/components/admin/${component}#${component}`,
  path,
  exact: true,
  strict: true,
  sensitive: false,
})

export default buildConfig({
  // Only an explicit origin (production with its domain, or local) becomes the server URL;
  // otherwise the admin uses relative URLs, so previews and the vercel.app alias both work.
  ...(config.NEXT_PUBLIC_SITE_URL ? { serverURL: config.NEXT_PUBLIC_SITE_URL } : {}),
  secret: config.PAYLOAD_SECRET,
  admin: {
    user: Users.slug,
    meta: { titleSuffix: ' · IIIC admin' },
    importMap: { baseDir: path.resolve(dirname) },
    // No dark mode anywhere, the admin included (CLAUDE.md #2).
    theme: 'light',
    // Payload's default avatar is Gravatar, which would send a hash of each staff email to a
    // third party and break the CSP (img-src 'self').
    avatar: 'default',
    components: {
      // IIIC's own two-factor views replace payload-totp's: same keys and paths, which the
      // plugin spreads after its own, so these win. One labelled code field each.
      views: {
        SetupTOTP: twoFactorView('SetupTwoFactor', '/setup-totp'),
        SetupTOTPBackslash: twoFactorView('SetupTwoFactor', '/setup-totp'),
        VerifyTOTP: twoFactorView('VerifyTwoFactor', '/verify-totp'),
        VerifyTOTPBackslash: twoFactorView('VerifyTwoFactor', '/verify-totp'),
      },
    },
  },
  collections: [Users, Media],
  editor: lexicalEditor(),
  email: emailNotConfigured,
  db: postgresAdapter({
    // A small pool per function instance (docs/12 §4); the statement timeout lives on
    // the database role (src/scripts/db-settings.ts), because the transaction pooler
    // ignores session settings.
    pool: { connectionString, max: 3 },
    migrationDir: path.resolve(dirname, 'migrations'),
    // Schema changes go through migrations in every environment, never push (docs/07).
    push: false,
  }),
  // Only the platform's own origin may call the API with a session cookie.
  csrf: config.allowedOrigins,
  cors: [],
  // The admin uses REST and server functions; GraphQL stays off to keep the surface small.
  graphQL: { disable: true },
  telemetry: false,
  plugins: [
    // Staff two-factor (docs/08 §9). It wraps the access of every collection before it, so it
    // stays the last plugin that adds collections; the two transforms after it only add hooks
    // and replace its English strings.
    payloadTotp(TOTP_OPTIONS),
    totpSecretAtRest({ collection: 'users', previousSecret: config.PAYLOAD_SECRET_PREVIOUS }),
    totpCopy(),
  ],
  sharp,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
