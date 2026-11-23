import 'server-only'

import { createHmac } from 'node:crypto'

import { errors, jwtVerify, SignJWT } from 'jose'

import { env } from '@/lib/env'
import { err, ok } from '@/lib/result'

import type { LinkPurpose, SignLink, VerifyLink } from './operations'

/**
 * Signed links in messages (docs/19 §7, §8): the withdraw page (`/w/<token>`, every transactional
 * email's footer), the unsubscribe page and its one-click endpoint (RFC 8058, every promotional
 * email). A token is a JWT (HS256) holding the purpose, the record's id and an expiry, under a key
 * derived from PAYLOAD_SECRET for this purpose alone, so nothing is stored for it and a token for
 * one purpose never opens another. While PAYLOAD_SECRET is being rotated, links signed under the
 * previous secret still open. A token carries an id, never an address.
 */

const LABEL = 'iiic:message-links:v1'

/** How long a link in a message keeps working: the life of the message's row and a month more. */
export const LINK_DAYS: Readonly<Record<LinkPurpose, number>> = {
  withdraw: 400,
  unsubscribe: 400,
  confirmSubscription: 7,
}

function keyFrom(secret: string): Uint8Array {
  return new Uint8Array(createHmac('sha256', secret).update(LABEL).digest())
}

function keys(): Uint8Array[] {
  const settings = env()
  return [settings.PAYLOAD_SECRET, settings.PAYLOAD_SECRET_PREVIOUS]
    .filter((secret): secret is string => Boolean(secret))
    .map(keyFrom)
}

export const signLink: SignLink = async ({ purpose, subjectId, expiresInDays }) => {
  const [key] = keys()
  return new SignJWT({ p: purpose, s: subjectId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${Math.max(1, Math.round(expiresInDays))}d`)
    .sign(key as Uint8Array)
}

export const verifyLink: VerifyLink = async (purpose, token) => {
  if (typeof token !== 'string' || token.length > 1024 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) {
    return err({ code: 'invalid' })
  }
  let expired = false
  for (const key of keys()) {
    try {
      const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] })
      const subjectId = Number(payload.s)
      if (payload.p !== purpose || !Number.isSafeInteger(subjectId) || subjectId < 1) {
        return err({ code: 'invalid' })
      }
      return ok({ subjectId })
    } catch (error) {
      if (error instanceof errors.JWTExpired) expired = true
    }
  }
  return err({ code: expired ? 'expired' : 'invalid' })
}

/** The pages and the endpoint the links open (builder C's pages, docs/19 §8). */
export function linkUrls(siteUrl: string, token: string) {
  const site = siteUrl.replace(/\/+$/, '')
  return {
    withdraw: `${site}/w/${token}`,
    unsubscribe: `${site}/newsletter/unsubscribe/${token}`,
    oneClick: `${site}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`,
  }
}
