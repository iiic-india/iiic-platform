import { commitTransaction, initTransaction, killTransaction, type PayloadHandler } from 'payload'

import { hasRole } from '@/access/roles'

const json = (body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

/**
 * POST /api/users/:id/reset-two-factor. An owner who has entered their own code clears another
 * staff member's authenticator, cancels their recovery codes, signs them out everywhere and
 * lifts a lock left by wrong codes; at their next sign-in they set up a new authenticator
 * (docs/05: owners manage staff). Their password stays as it is: after a lost phone, the owner
 * sets a new one as well.
 */
export const resetTwoFactor: PayloadHandler = async (req) => {
  const actor = req.user
  // Payload marks the strategy that authenticated the request; 'totp' means a code was entered.
  const strategy = (actor as { _strategy?: string } | null)?._strategy
  if (!actor || actor.collection !== 'users' || strategy !== 'totp') {
    return json({ message: 'Sign in with your code to do this.' }, 401)
  }
  if (!hasRole(actor, 'owner')) {
    return json({ message: 'Only an owner can reset two-factor.' }, 403)
  }
  const id = req.routeParams?.id
  if (typeof id !== 'string' && typeof id !== 'number') {
    return json({ message: 'That staff account was not found.' }, 404)
  }
  if (String(id) === String(actor.id)) {
    return json({ message: 'Ask another owner to reset your two-factor.' }, 400)
  }
  const owned = await initTransaction(req)
  // The audit entry names what the owner did (src/plugins/auditLog.ts).
  req.context.auditAction = 'reset-two-factor'
  try {
    const person = await req.payload.update({
      collection: 'users',
      id,
      data: { totpSecret: null, sessions: [] },
      overrideAccess: true,
      req,
    })
    await req.payload.delete({
      collection: 'staff-recovery-codes',
      where: { user: { equals: id } },
      overrideAccess: true,
      req,
    })
    // Payload's unlock lifts the sign-in lock, and payload-totp then clears its count of
    // wrong codes, so the person is not refused when they come to set up a new authenticator.
    await req.payload.unlock({
      collection: 'users',
      // Payload's generated type lists a password for every auth operation; unlock reads only
      // the email.
      data: { email: person.email } as { email: string; password: string },
      overrideAccess: true,
      req,
    })
    if (owned) await commitTransaction(req)
  } catch (error) {
    if (owned) await killTransaction(req)
    if ((error as { status?: number } | null)?.status === 404) {
      return json({ message: 'That staff account was not found.' }, 404)
    }
    // The error's name only: its message can carry the query and the person's details.
    req.payload.logger.error(
      `Resetting two-factor failed (${error instanceof Error ? error.name : 'unknown error'}).`,
    )
    return json({ message: 'Two-factor was not reset. Try again.' }, 500)
  }
  return json({ ok: true })
}
