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

/** An optional variable, where the empty line copied from .env.example counts as unset. */
const optional = <T extends z.ZodType>(type: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), type.optional())

/**
 * A 32-byte key written in base64 or base64url (`openssl rand -base64 32`): 43 characters, with
 * the one padding `=` base64 adds, or without it.
 */
const KEY_32 = /^[A-Za-z0-9+/_-]{43}=?$/
const key32 = (name: string) =>
  optional(
    z
      .string()
      .regex(KEY_32, `${name} must be 32 random bytes in base64 (openssl rand -base64 32)`)
      .refine(
        (value) => Buffer.from(value, 'base64').length === 32,
        `${name} must decode to exactly 32 bytes`,
      ),
  )

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
  // The private bucket (docs/07): certificates' PDFs (M5) and, later, invoices and original
  // review files. Unset, a certificate is not issued on a deployment (docs/18 §4).
  R2_BUCKET_PRIVATE: optional(z.string().min(3)),
  // Session notes (D-11; docs/18 §3): the key that encrypts a note's body, per environment, and
  // while it is being rotated the key it replaces (docs/08 §9, the runbook). Unset, the app still
  // builds and runs, and refuses to store or open a note.
  NOTES_ENCRYPTION_KEY: key32('NOTES_ENCRYPTION_KEY'),
  NOTES_ENCRYPTION_KEY_PREVIOUS: key32('NOTES_ENCRYPTION_KEY_PREVIOUS'),
  R2_PUBLIC_BASE_URL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.url().optional(),
  ),
  // Email through Resend (D-47). Without a key, messages are dropped with a note in the log.
  RESEND_API_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().optional(),
  ),
  // Resend's shared sender where none is set (development); it delivers only to the Resend
  // account's own address. Vercel sets the platform's own sender (D-47).
  EMAIL_FROM_ADDRESS: z.string().default('onboarding@resend.dev'),
  // Messaging (M6, docs/19). The cron route's bearer token; without it the route answers 503.
  CRON_SECRET: optional(z.string().min(32, 'CRON_SECRET must be at least 32 characters')),
  // The signing secret of Resend's webhook (Svix), for bounces and complaints (docs/13 §6).
  RESEND_WEBHOOK_SECRET: optional(
    z.string().regex(/^whsec_[A-Za-z0-9+/=]+$/, 'RESEND_WEBHOOK_SECRET must be a whsec_ secret'),
  ),
  // The root mail domain (D-05): senders on notify. and news., replies to its role inboxes.
  MAIL_DOMAIN: optional(
    z
      .string()
      .regex(/^(?=.{3,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/, 'MAIL_DOMAIN must be a domain name'),
  ),
  // `fake` swaps both senders for the in-memory ones (src/lib/messaging/fakes.ts): local and CI.
  MESSAGING_TRANSPORT: z.enum(['live', 'fake']).default('live'),
  // WhatsApp through AiSensy (D-06): all three together, or none, and messages go by email.
  WHATSAPP_PROVIDER: z.enum(['aisensy']).default('aisensy'),
  WHATSAPP_API_KEY: optional(z.string().min(1)),
  WHATSAPP_WEBHOOK_SECRET: optional(
    z.string().min(32, 'WHATSAPP_WEBHOOK_SECRET must be at least 32 characters'),
  ),
  WHATSAPP_SENDER_NUMBER: optional(
    z.string().regex(/^\+[1-9]\d{7,14}$/, 'WHATSAPP_SENDER_NUMBER must be in E.164, such as +91…'),
  ),
  // Error reports to Sentry (docs/12 §7, D-49). Vercel's Sentry integration sets the NEXT_PUBLIC_
  // name; only the server reads either. Without one nothing is sent (development, CI).
  SENTRY_DSN: z.preprocess((value) => (value === '' ? undefined : value), z.url().optional()),
  NEXT_PUBLIC_SENTRY_DSN: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.url().optional(),
  ),
  // Razorpay (docs/07, D-12): all three together, or none, and payments answer "not configured".
  // A live key (rzp_live_) only on Vercel's production deployment; test keys everywhere else.
  RAZORPAY_KEY_ID: optional(
    z.string().regex(/^rzp_(test|live)_[A-Za-z0-9]+$/, 'RAZORPAY_KEY_ID must be a Razorpay key id'),
  ),
  RAZORPAY_KEY_SECRET: optional(z.string().min(1)),
  RAZORPAY_WEBHOOK_SECRET: optional(z.string().min(16, 'RAZORPAY_WEBHOOK_SECRET is too short')),
  // `fake` swaps the gateway for the in-memory one (src/lib/payments/fakeGateway.ts): local
  // development and CI only, never on a Vercel deployment (docs/16 §11).
  PAYMENT_GATEWAY: z.enum(['razorpay', 'fake']).default('razorpay'),
  // Google Calendar through a Workspace service account with domain-wide delegation, Calendar
  // scope only (D-22, D-23; docs/16 §7). Without them no calendar is read or written.
  GOOGLE_WORKSPACE_DOMAIN: optional(z.string()),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: optional(z.email()),
  GOOGLE_SERVICE_ACCOUNT_KEY: optional(z.string()),
  GOOGLE_CALENDAR_WEBHOOK_TOKEN: optional(z.string().min(32)),
  // Zoho Books, India data centre (D-13). Without them invoices wait in `pending`.
  ZOHO_BOOKS_ORGANIZATION_ID: optional(z.string()),
  ZOHO_CLIENT_ID: optional(z.string()),
  ZOHO_CLIENT_SECRET: optional(z.string()),
  ZOHO_REFRESH_TOKEN: optional(z.string()),
  ZOHO_API_BASE: z.url().default('https://www.zohoapis.in/books/v3'),
  // Cloudflare Turnstile on the public forms (docs/08 §9; docs/17 §6): both keys, or neither, and
  // the forms rely on their honeypot, timing and rate limits alone.
  TURNSTILE_SITE_KEY: optional(z.string().min(1)),
  TURNSTILE_SECRET_KEY: optional(z.string().min(1)),
  PLATFORM_HOSTS: z.string().default('localhost:3000'),
  INSTITUTE_HOSTS: z.string().default(''),
  // Set by Vercel on every deployment (hostnames, without the scheme).
  VERCEL_ENV: z.enum(['development', 'preview', 'production']).optional(),
  VERCEL_URL: z.string().optional(),
  VERCEL_BRANCH_URL: z.string().optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
  // The commit a deployment was built from; error reports carry it as their release.
  VERCEL_GIT_COMMIT_SHA: z.string().optional(),
})

export type ServerEnv = z.infer<typeof schema> & {
  /** The origin this deployment answers on: the configured site URL, else Vercel's. */
  siteUrl: string
  /** Every origin allowed to call the API with a session cookie (Payload's CSRF list). */
  allowedOrigins: string[]
  /** The R2 media bucket's public origin, when R2 is configured. */
  mediaOrigin?: string
  /** Where error reports go, when Sentry is configured. */
  sentryDsn?: string
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
  const razorpay = [data.RAZORPAY_KEY_ID, data.RAZORPAY_KEY_SECRET, data.RAZORPAY_WEBHOOK_SECRET]
  if (razorpay.some(Boolean) && !razorpay.every(Boolean)) {
    throw new Error(
      'Invalid environment:\n- Razorpay: set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET together, or none of them',
    )
  }
  if (data.RAZORPAY_KEY_ID?.startsWith('rzp_live_') && data.VERCEL_ENV !== 'production') {
    throw new Error(
      'Invalid environment:\n- RAZORPAY_KEY_ID: a live key belongs to the production deployment only; use a test key (rzp_test_) here',
    )
  }
  if (Boolean(data.TURNSTILE_SITE_KEY) !== Boolean(data.TURNSTILE_SECRET_KEY)) {
    throw new Error(
      'Invalid environment:\n- Turnstile: set TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY together, or neither',
    )
  }
  if (data.PAYMENT_GATEWAY === 'fake' && data.VERCEL_ENV) {
    throw new Error(
      'Invalid environment:\n- PAYMENT_GATEWAY: the fake gateway runs only locally and in CI, never on a Vercel deployment',
    )
  }
  const whatsapp = [
    data.WHATSAPP_API_KEY,
    data.WHATSAPP_WEBHOOK_SECRET,
    data.WHATSAPP_SENDER_NUMBER,
  ]
  if (whatsapp.some(Boolean) && !whatsapp.every(Boolean)) {
    throw new Error(
      'Invalid environment:\n- WhatsApp: set WHATSAPP_API_KEY, WHATSAPP_WEBHOOK_SECRET and WHATSAPP_SENDER_NUMBER together, or none of them',
    )
  }
  if (data.MESSAGING_TRANSPORT === 'fake' && data.VERCEL_ENV) {
    throw new Error(
      'Invalid environment:\n- MESSAGING_TRANSPORT: the fake senders run only locally and in CI, never on a Vercel deployment',
    )
  }
  if (data.NOTES_ENCRYPTION_KEY_PREVIOUS && !data.NOTES_ENCRYPTION_KEY) {
    throw new Error(
      'Invalid environment:\n- NOTES_ENCRYPTION_KEY_PREVIOUS: set it only beside a new NOTES_ENCRYPTION_KEY, while rotating',
    )
  }
  if (
    data.NOTES_ENCRYPTION_KEY_PREVIOUS &&
    Buffer.from(data.NOTES_ENCRYPTION_KEY_PREVIOUS, 'base64').equals(
      Buffer.from(data.NOTES_ENCRYPTION_KEY ?? '', 'base64'),
    )
  ) {
    throw new Error(
      'Invalid environment:\n- NOTES_ENCRYPTION_KEY_PREVIOUS: it must differ from NOTES_ENCRYPTION_KEY',
    )
  }
  const mediaOrigin = data.R2_PUBLIC_BASE_URL ? new URL(data.R2_PUBLIC_BASE_URL).origin : undefined
  const sentryDsn = data.SENTRY_DSN ?? data.NEXT_PUBLIC_SENTRY_DSN
  return { ...data, siteUrl, allowedOrigins, mediaOrigin, sentryDsn }
}

let cached: ServerEnv | undefined

export function env(): ServerEnv {
  cached ??= parseEnv(process.env)
  return cached
}
