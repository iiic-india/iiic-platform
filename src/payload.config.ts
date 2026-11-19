import path from 'path'
import { fileURLToPath } from 'url'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import sharp from 'sharp'

import { Media } from './collections/Media'
import { Users } from './collections/Users'
import { env } from './lib/env'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

const config = env()

// Migrations run over Supabase's direct connection; the app uses the pooled one (docs/07).
const connectionString =
  process.env.PAYLOAD_MIGRATING === 'true'
    ? config.DATABASE_URL_DIRECT || config.DATABASE_URL
    : config.DATABASE_URL

export default buildConfig({
  // Only an explicit origin (production with its domain, or local) becomes the server URL;
  // otherwise the admin uses relative URLs, so previews and the vercel.app alias both work.
  ...(config.NEXT_PUBLIC_SITE_URL ? { serverURL: config.NEXT_PUBLIC_SITE_URL } : {}),
  secret: config.PAYLOAD_SECRET,
  admin: {
    user: Users.slug,
    meta: { titleSuffix: ' · IIIC admin' },
    importMap: { baseDir: path.resolve(dirname) },
  },
  collections: [Users, Media],
  editor: lexicalEditor(),
  db: postgresAdapter({
    pool: { connectionString },
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
