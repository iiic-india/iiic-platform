import { z } from 'zod'

/**
 * Server environment, validated once at start-up. Every variable the code reads is
 * listed in `.env.example`; this schema covers what Milestone 1 needs and grows with
 * each milestone. Values never reach a client bundle (only NEXT_PUBLIC_* may).
 *
 * This module is also loaded by the Payload CLI (migrations, type generation), which
 * runs outside Next.js, so it cannot import `server-only`. Never import it from a
 * client component: it would throw, because the secrets are not there.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_SITE_URL: z.url().optional(),
  PAYLOAD_SECRET: z.string().min(32, 'PAYLOAD_SECRET must be at least 32 characters'),
  // Only while PAYLOAD_SECRET is being rotated (docs/08 §9): the value it replaced, so staff
  // two-factor secrets encrypted under it still open. The empty line from .env.example is unset.
  PAYLOAD_SECRET_PREVIOUS: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(32, 'PAYLOAD_SECRET_PREVIOUS must be at least 32 characters').optional(),
  ),
  DATABASE_URL: z
    .string()
    .startsWith('postgres', 'DATABASE_URL must be a Postgres connection string'),
  DATABASE_URL_DIRECT: z.string().optional(),
  // Production servers only, while the first owner is created (D-41); deleted afterwards.
  // It travels in a link, so only URL-safe characters (base64url): a "+" would arrive as a
  // space. The empty line copied from .env.example counts as unset.
  OWNER_SETUP_TOKEN: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z
      .string()
      .min(32, 'OWNER_SETUP_TOKEN must be at least 32 characters')
      .regex(
        /^[A-Za-z0-9_-]+$/,
        'OWNER_SETUP_TOKEN may use only letters, digits, - and _ (base64url), because it travels in a link',
      )
      .optional(),
  ),
  // Cloudflare R2 (docs/07): all four together, or none, and media stays on the local disk
  // (development and CI). The public base URL is the bucket's public address.
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_PUBLIC: z.string().default('iiic-media'),
  R2_PUBLIC_BASE_URL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.url().optional(),
  ),
  // Email through Resend (D-47). Without a key, messages are dropped with a note in the log.
  RESEND_API_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().optional(),
  ),
  // Resend's shared sender until the platform domain is verified (D-05); it delivers only to the
  // Resend account's own address.
  EMAIL_FROM_ADDRESS: z.string().default('onboarding@resend.dev'),
  PLATFORM_HOSTS: z.string().default('localhost:3000'),
  INSTITUTE_HOSTS: z.string().default(''),
  // Set by Vercel on every deployment (hostnames, without the scheme).
  VERCEL_ENV: z.enum(['development', 'preview', 'production']).optional(),
  VERCEL_URL: z.string().optional(),
  VERCEL_BRANCH_URL: z.string().optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
})

export type ServerEnv = z.infer<typeof schema> & {
  /** The origin this deployment answers on: the configured site URL, else Vercel's. */
  siteUrl: string
  /** Every origin allowed to call the API with a session cookie (Payload's CSRF list). */
  allowedOrigins: string[]
  /** The R2 media bucket's public origin, when R2 is configured. */
  mediaOrigin?: string
}

const LOCAL = 'http://localhost:3000'

export function parseEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = schema.safeParse(source)
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    throw new Error(`Invalid environment:\n- ${problems.join('\n- ')}`)
  }
  const data = result.data
  // Previews have a new URL per deployment and per branch, so they fall back to the
  // hostnames Vercel provides instead of a fixed NEXT_PUBLIC_SITE_URL.
  const vercelOrigins = [
    data.VERCEL_URL,
    data.VERCEL_BRANCH_URL,
    data.VERCEL_PROJECT_PRODUCTION_URL,
  ]
    .filter((host): host is string => Boolean(host))
    .map((host) => `https://${host}`)
  const productionOrigin =
    data.VERCEL_ENV === 'production' && data.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${data.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined
  const siteUrl = data.NEXT_PUBLIC_SITE_URL ?? productionOrigin ?? vercelOrigins[0] ?? LOCAL
  const allowedOrigins = [...new Set([siteUrl, ...vercelOrigins])]
  const r2 = [
    data.R2_ACCOUNT_ID,
    data.R2_ACCESS_KEY_ID,
    data.R2_SECRET_ACCESS_KEY,
    data.R2_PUBLIC_BASE_URL,
  ]
  if (r2.some(Boolean) && !r2.every(Boolean)) {
    throw new Error(
      'Invalid environment:\n- R2: set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_PUBLIC_BASE_URL together, or none of them',
    )
  }
  const mediaOrigin = data.R2_PUBLIC_BASE_URL ? new URL(data.R2_PUBLIC_BASE_URL).origin : undefined
  return { ...data, siteUrl, allowedOrigins, mediaOrigin }
}

let cached: ServerEnv | undefined

export function env(): ServerEnv {
  cached ??= parseEnv(process.env)
  return cached
}
