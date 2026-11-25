import type { BetterAuthPlugin } from 'better-auth'
import { APIError, createAuthEndpoint } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { z } from 'zod'

import { SIGN_IN_CHANNELS } from '../contract'
import { codeIdentifier, placeholderEmail, triesUsed } from './codes'

/**
 * IIIC's own Better Auth plugin (docs/20 §3.4): server-only endpoints (`createAuthEndpoint
 * .serverOnly`, never on an HTTP route, and Better Auth's handler is not mounted anyway), each a
 * few lines on Better Auth's internal adapter and cookie helpers, so the platform decides when a
 * user exists and when a session starts:
 *
 * - `startSession`: a session for a user, with Better Auth's `dontRememberMe` when the device is
 *   not kept (a day at most, ended with the browser), and its cookie (D-115); a session the
 *   browser already carried (a person signing in again) is ended once the new one starts (D-130);
 * - `createCustomer`: a user for a proven email, or for a proven mobile with a placeholder address
 *   that is never written to; made only after the account consent (docs/20 §4.5). A user that
 *   already holds the detail is returned as it is, so an account step that failed part-way
 *   finishes on the next code;
 * - `addDetail`: a second proven detail on the user (docs/20 §4.6);
 * - `forgetCode`: deletes the code kept for an address, so a new code replaces the old one and a
 *   code that was checked is used up (docs/20 §4.2);
 * - `codeTries`: how many wrong tries the address's current code has used, so the code step can
 *   say how many are left (Better Auth's own answer says only that the code was wrong).
 *
 * Nothing here logs; the bodies hold addresses, which travel only between the platform's server
 * code and the database.
 */

const Channel = z.enum(SIGN_IN_CHANNELS)
const Purpose = z.enum(['signIn', 'addDetail'])

export const iiicAccounts = () =>
  ({
    id: 'iiic-accounts',
    endpoints: {
      startSession: createAuthEndpoint.serverOnly(
        {
          method: 'POST',
          body: z.object({ userId: z.string().min(1), trusted: z.boolean() }),
        },
        async (ctx) => {
          const user = await ctx.context.internalAdapter.findUserById(ctx.body.userId)
          if (!user) throw new APIError('NOT_FOUND', { code: 'USER_NOT_FOUND' })
          // The session this browser already carried ("Sign in again", D-121), read before the
          // new cookie replaces it: no browser holds it once this one is set.
          const carried = await ctx.getSignedCookie(
            ctx.context.authCookies.sessionToken.name,
            ctx.context.secret,
          )
          const dontRememberMe = !ctx.body.trusted
          const session = await ctx.context.internalAdapter.createSession(user.id, dontRememberMe)
          await setSessionCookie(ctx, { session, user }, dontRememberMe)
          // Ended once the new one has started, so the devices list shows this browser once and
          // nothing is left alive for a cookie that was replaced (docs/20 §4.7; D-130).
          const replaced = typeof carried === 'string' && carried !== session.token
          if (replaced) await ctx.context.internalAdapter.deleteSession(carried)
          return ctx.json({
            sessionId: session.id,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
            replaced,
          })
        },
      ),
      createCustomer: createAuthEndpoint.serverOnly(
        {
          method: 'POST',
          body: z.object({ channel: Channel, value: z.string().min(3).max(254) }),
        },
        async (ctx) => {
          const { channel, value } = ctx.body
          const existing =
            channel === 'email'
              ? ((await ctx.context.internalAdapter.findUserByEmail(value))?.user ?? null)
              : await ctx.context.adapter.findOne<{ id: string }>({
                  model: 'user',
                  where: [{ field: 'phoneNumber', value }],
                })
          if (existing) return ctx.json({ userId: existing.id, created: false })
          const user = await ctx.context.internalAdapter.createUser(
            channel === 'email'
              ? { name: '', email: value, emailVerified: true }
              : {
                  name: '',
                  email: placeholderEmail(value),
                  emailVerified: false,
                  phoneNumber: value,
                  phoneNumberVerified: true,
                },
            { method: channel === 'email' ? 'email-otp' : 'phone-number' },
          )
          return ctx.json({ userId: user.id, created: true })
        },
      ),
      addDetail: createAuthEndpoint.serverOnly(
        {
          method: 'POST',
          body: z.object({ userId: z.string().min(1), channel: Channel, value: z.string().min(3) }),
        },
        async (ctx) => {
          const { userId, channel, value } = ctx.body
          await ctx.context.internalAdapter.updateUser(
            userId,
            channel === 'email'
              ? { email: value, emailVerified: true }
              : { phoneNumber: value, phoneNumberVerified: true },
          )
          return ctx.json({ ok: true })
        },
      ),
      forgetCode: createAuthEndpoint.serverOnly(
        {
          method: 'POST',
          body: z.object({ purpose: Purpose, channel: Channel, value: z.string().min(3) }),
        },
        async (ctx) => {
          const { purpose, channel, value } = ctx.body
          await ctx.context.internalAdapter.deleteVerificationByIdentifier(
            codeIdentifier(purpose, channel, value),
          )
          return ctx.json({ ok: true })
        },
      ),
      codeTries: createAuthEndpoint.serverOnly(
        {
          method: 'POST',
          body: z.object({ purpose: Purpose, channel: Channel, value: z.string().min(3) }),
        },
        async (ctx) => {
          const { purpose, channel, value } = ctx.body
          const found = await ctx.context.internalAdapter.findVerificationValue(
            codeIdentifier(purpose, channel, value),
          )
          const live = found !== null && new Date(found.expiresAt).getTime() > Date.now()
          return ctx.json({ live, used: live ? triesUsed(found.value) : 0 })
        },
      ),
    },
  }) satisfies BetterAuthPlugin
