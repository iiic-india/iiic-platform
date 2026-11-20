import path from 'path'
import { fileURLToPath } from 'url'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig, type EmailAdapter } from 'payload'
import sharp from 'sharp'

import { Media } from './collections/Media'
import { Users } from './collections/Users'
import { env } from './lib/env'

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
  },
  collections: [Users, Media],
  editor: lexicalEditor(),
  email: emailNotConfigured,
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
  sharp,
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
})
