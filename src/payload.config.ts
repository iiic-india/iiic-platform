import path from 'path'
import { fileURLToPath } from 'url'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { resendAdapter } from '@payloadcms/email-resend'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { buildConfig, type EmailAdapter } from 'payload'
import { payloadTotp } from 'payload-totp'
import sharp from 'sharp'

import { AuditLog } from './collections/AuditLog'
import { Media } from './collections/Media'
import { Pages } from './collections/Pages'
import { StaffRecoveryCodes } from './collections/StaffRecoveryCodes'
import { Users } from './collections/Users'
import { TOTP_OPTIONS } from './lib/auth/totp'
import { env } from './lib/env'
import { reportServerError, reportTestError } from './lib/monitoring/sentry'
import { auditLog } from './plugins/auditLog'
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
    meta: {
      titleSuffix: ' · IIIC admin',
      // IIIC's own tab icon in place of Payload's (src/app/icon.svg, D-48); Next.js links
      // src/app/favicon.ico by itself.
      icons: [{ rel: 'icon', url: '/icon.svg', type: 'image/svg+xml' }],
    },
    importMap: { baseDir: path.resolve(dirname) },
    // No dark mode anywhere, the admin included (CLAUDE.md #2).
    theme: 'light',
    // Payload's default avatar is Gravatar, which would send a hash of each staff email to a
    // third party and break the CSP (img-src 'self').
    avatar: 'default',
    components: {
      // Recovery codes for staff two-factor (src/lib/auth/recoveryEndpoints.ts).
      beforeDashboard: ['/components/admin/RecoveryCodes#RecoveryCodes'],
      // Content → Placeholders: what the pages still wait for (D-56).
      afterNavLinks: ['/components/admin/PlaceholdersNavLink#PlaceholdersNavLink'],
      // IIIC's own two-factor views replace payload-totp's: same keys and paths, which the
      // plugin spreads after its own, so these win. One labelled code field each; the verify
      // view also takes a recovery code.
      views: {
        SetupTOTP: twoFactorView('SetupTwoFactor', '/setup-totp'),
        SetupTOTPBackslash: twoFactorView('SetupTwoFactor', '/setup-totp'),
        VerifyTOTP: twoFactorView('VerifyTwoFactor', '/verify-totp'),
        VerifyTOTPBackslash: twoFactorView('VerifyTwoFactor', '/verify-totp'),
        // The view checks the user and the role itself (CLAUDE.md #6).
        placeholders: {
          Component: '/components/admin/PlaceholdersView#PlaceholdersView',
          path: '/placeholders',
          exact: true,
        },
      },
    },
  },
  collections: [Users, Pages, Media, StaffRecoveryCodes, AuditLog],
  editor: lexicalEditor(),
  email: config.RESEND_API_KEY
    ? resendAdapter({
        apiKey: config.RESEND_API_KEY,
        defaultFromAddress: config.EMAIL_FROM_ADDRESS,
        defaultFromName: 'IIIC',
      })
    : emailNotConfigured,
  db: postgresAdapter({
    // A small pool per function instance (docs/12 §4); the statement timeout lives on
    // the database role (src/scripts/db-settings.ts), because the transaction pooler
    // ignores session settings.
    // A request that cannot get a connection within 5 s fails instead of waiting forever:
    // a sign-in holds one connection while it reads the committed deactivation flag on another.
    pool: { connectionString, max: 3, connectionTimeoutMillis: 5_000 },
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
  // Uploads pass through the server, so the request must stay under Vercel's 4.5 MB body limit
  // (D-46); images are re-encoded there before they are stored.
  upload: {
    limits: { fileSize: 4 * 1024 * 1024 },
    abortOnLimit: true,
    responseOnLimit: 'Choose an image under 4 MB.',
  },
  // The server's own faults go to Sentry, scrubbed (src/lib/monitoring/sentry.ts, D-49); an owner
  // can send a test error to check that reports arrive.
  hooks: { afterError: [reportServerError] },
  endpoints: [{ path: '/report-test-error', method: 'post', handler: reportTestError }],
  plugins: [
    // Media in Cloudflare R2's public bucket (docs/07) once R2 is configured; on the local disk
    // before that (development, CI). Files are served straight from the bucket's public URL.
    s3Storage({
      enabled: Boolean(config.R2_ACCESS_KEY_ID),
      // The same columns with R2 on or off, so CI, local and Vercel share one schema.
      alwaysInsertFields: true,
      collections: {
        media: {
          disablePayloadAccessControl: true,
          generateFileURL: ({ filename, prefix }) =>
            `${config.R2_PUBLIC_BASE_URL}/${prefix ? `${prefix}/` : ''}${filename}`,
        },
      },
      bucket: config.R2_BUCKET_PUBLIC,
      config: {
        endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        region: 'auto',
        credentials: {
          accessKeyId: config.R2_ACCESS_KEY_ID ?? '',
          secretAccessKey: config.R2_SECRET_ACCESS_KEY ?? '',
        },
      },
    }),
    // Staff two-factor (docs/08 §9). It wraps the access of every collection before it, so it
    // stays the last plugin that adds collections; the two transforms after it only add hooks
    // and replace its English strings.
    payloadTotp(TOTP_OPTIONS),
    totpSecretAtRest({ collection: 'users', previousSecret: config.PAYLOAD_SECRET_PREVIOUS }),
    totpCopy(),
    // Last, so it sees every collection (src/plugins/auditLog.ts).
    auditLog(),
  ],
  sharp,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
