import { AsyncLocalStorage } from 'node:async_hooks'

import type { BetterAuthOptions } from 'better-auth'
import { nextCookies } from 'better-auth/next-js'
import { emailOTP } from 'better-auth/plugins/email-otp'
import { phoneNumber } from 'better-auth/plugins/phone-number'

import { scrubText } from '@/lib/monitoring/scrub'
import { toE164 } from '@/lib/phone'

import { CUSTOMER_AUTH, SESSION_COOKIE_PREFIX, SIGN_IN } from '../contract'
import { iiicAccounts } from './plugin'

/**
 * Better Auth's options for customer sign-in (docs/20 §3.4), built in one place so the running
 * instance (`instance.ts`), the script that prints its tables' SQL
 * (src/scripts/print-customer-auth-sql.ts) and the tests use exactly the same ones: a change here
 * that needs another column fails the schema test until a migration adds it (§3.3).
 *
 * Free of `server-only` so the Payload CLI's script can load it; nothing here reads the
 * environment or a secret on its own: the caller passes them in.
 */

/**
 * Hands a WhatsApp code to the platform's sender (docs/20 §4.3). The phone plugin generates the
 * code and calls `sendOTP` with it; the sign-in action runs Better Auth's call inside this store
 * with a function that plans A1 for its own `sign-in-requests` row, so the code travels from the
 * plugin to the message's first try and nowhere else.
 */
export type CodeCourier = (code: string) => Promise<void>
export const whatsappCourier = new AsyncLocalStorage<CodeCourier>()

export type CustomerAuthInput = {
  /** BETTER_AUTH_SECRET: signs the session cookie. */
  secret: string
  /** The site's own origin (`env().siteUrl`); BETTER_AUTH_URL is not read. */
  siteUrl: string
  trustedOrigins: string[]
  /** Postgres through Payload's own pool (instance.ts), or the memory adapter in unit tests. */
  database: NonNullable<BetterAuthOptions['database']>
  /** ACCOUNTS_TEST_CODE: a fixed email code, locally and in CI only (env.ts refuses it on Vercel). */
  testCode?: string
  /** The platform's logger; it receives Better Auth's message only, scrubbed, never its arguments. */
  log: (message: string) => void
}

const DAY_SECONDS = 24 * 60 * 60

export function customerAuthOptions(input: CustomerAuthInput) {
  return {
    appName: 'IIIC',
    secret: input.secret,
    baseURL: input.siteUrl,
    trustedOrigins: input.trustedOrigins,
    database: input.database,
    user: { modelName: CUSTOMER_AUTH.tables.user },
    session: {
      modelName: CUSTOMER_AUTH.tables.session,
      // Thirty days from sign-in on a kept device; a day at most otherwise, through Better Auth's
      // own `dontRememberMe` (D-115). A session never slides: server components cannot write a
      // cookie, and the cookie written at sign-in is the one for the session's life.
      expiresIn: SIGN_IN.trustedSessionDays * DAY_SECONDS,
      disableSessionRefresh: true,
      // Every read asks the database, so a revoked session ends at once.
      cookieCache: { enabled: false },
      // The platform asks for a recent sign-in itself where it matters (requireAccount's
      // `recentMinutes`, D-121); Better Auth's own freshness rule would refuse the devices list
      // a day after sign-in.
      freshAge: 0,
    },
    // Better Auth's "account" table: no passwords and no social sign-in, so it stays empty.
    account: {
      modelName: CUSTOMER_AUTH.tables.account,
      accountLinking: { enabled: false },
    },
    verification: {
      modelName: CUSTOMER_AUTH.tables.verification,
      // No address in plain text in `verifications`.
      storeIdentifier: 'hashed',
    },
    emailAndPassword: { enabled: false },
    socialProviders: {},
    advanced: {
      cookiePrefix: SESSION_COOKIE_PREFIX,
      useSecureCookies: input.siteUrl.startsWith('https://'),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
      // A session keeps no IP address; the devices list names the browser only.
      ipAddress: { disableIpTracking: true },
    },
    // Better Auth's limiter guards its HTTP routes, which are not mounted; the limits are the
    // platform's, counted from `sign-in-requests` (docs/20 §4.8).
    rateLimit: { enabled: false },
    telemetry: { enabled: false },
    logger: {
      level: 'error',
      // Better Auth's arguments can carry an address: only its message is logged, scrubbed.
      log: (_level, message) => input.log(`customer sign-in: ${scrubText(String(message))}`),
    },
    plugins: [
      emailOTP({
        otpLength: SIGN_IN.codeLength,
        expiresIn: SIGN_IN.codeTtlSeconds,
        allowedAttempts: SIGN_IN.attemptsPerCode,
        storeOTP: 'hashed',
        resendStrategy: 'rotate',
        // Users are made only by IIIC's plugin, after the account consent (docs/20 §4.5).
        disableSignUp: true,
        ...(input.testCode ? { generateOTP: () => input.testCode } : {}),
        // The platform sends the code itself (`createVerificationOTP` returns it, docs/20 §4.3).
        sendVerificationOTP: async () => {
          throw new Error('Email codes are sent by the platform, not by Better Auth.')
        },
      }),
      phoneNumber({
        otpLength: SIGN_IN.codeLength,
        expiresIn: SIGN_IN.codeTtlSeconds,
        allowedAttempts: SIGN_IN.attemptsPerCode,
        phoneNumberValidator: (value: string) => toE164(value) === value,
        sendOTP: async ({ code }) => {
          const courier = whatsappCourier.getStore()
          if (!courier) throw new Error('A WhatsApp code was made outside the sign-in action.')
          await courier(code)
        },
      }),
      iiicAccounts(),
      // Last, so the cookies every other plugin sets reach Next.js's cookie store.
      nextCookies(),
    ],
  } satisfies BetterAuthOptions
}

export type CustomerAuthOptions = ReturnType<typeof customerAuthOptions>
