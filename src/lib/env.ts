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
  NEXT_PUBLIC_SITE_URL: z.url().default('http://localhost:3000'),
  PAYLOAD_SECRET: z.string().min(32, 'PAYLOAD_SECRET must be at least 32 characters'),
  DATABASE_URL: z
    .string()
    .startsWith('postgres', 'DATABASE_URL must be a Postgres connection string'),
  DATABASE_URL_DIRECT: z.string().optional(),
  PLATFORM_HOSTS: z.string().default('localhost:3000'),
  INSTITUTE_HOSTS: z.string().default(''),
})

export type ServerEnv = z.infer<typeof schema>

export function parseEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = schema.safeParse(source)
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    throw new Error(`Invalid environment:\n- ${problems.join('\n- ')}`)
  }
  return result.data
}

let cached: ServerEnv | undefined

export function env(): ServerEnv {
  cached ??= parseEnv(process.env)
  return cached
}
