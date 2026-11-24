import { z } from 'zod'

import { isIstDay } from '@/fields/istDay'
import { atIst } from '@/lib/booking/slots'
import { err, ok, type Result } from '@/lib/result'

/**
 * What the office's endpoints accept (docs/16 §12, E), checked with Zod at the boundary. The
 * admin's forms post what their fields hold, so numbers may arrive as text and an empty field as
 * ''. A time is either an instant with its offset (the API) or a wall-clock time in India as a
 * `datetime-local` field writes it (YYYY-MM-DDTHH:MM), turned into an instant through
 * @date-fns/tz (CLAUDE.md #8: times are entered and shown in India time, stored in UTC).
 */

export type InvalidInput = { code: 'invalid-input'; fields: string[] }

const WALL_CLOCK = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/

/** An instant from an ISO time with its offset, or from a wall-clock time in India. */
export const When = z.string().transform((value, context) => {
  const trimmed = value.trim()
  const wall = WALL_CLOCK.exec(trimmed)
  if (wall) {
    const [, day, clock] = wall
    const [hours, minutes] = (clock as string).split(':').map(Number)
    if (isIstDay(day) && (hours as number) < 24 && (minutes as number) < 60) {
      return atIst(day, clock as string)
    }
  } else if (z.iso.datetime({ offset: true }).safeParse(trimmed).success) {
    return new Date(trimmed)
  }
  context.addIssue({ code: 'custom', message: 'A time as YYYY-MM-DDTHH:MM, India time.' })
  return z.NEVER
})

/** A record's id, from the route or a form's select. */
export const Id = z.coerce.number().int().positive()

/** A form's empty field is no answer at all. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' || value === null ? undefined : value), schema.optional())

const Paise = z.coerce.number().int().nonnegative()

/**
 * Cancelling with the refund shown first (docs/05, Bookings and the "Refund" workflow): who
 * cancels, the reason (every destructive action asks for one, docs/05), and the refund the page
 * showed for each choice. The server works the refund out again and refuses when it differs
 * (`refund-changed`), so nobody confirms an amount they did not see.
 */
export const CancelBody = z.object({
  by: z.enum(['client', 'iiic']),
  reason: z.string().trim().min(1).max(1000),
  shownClientPaise: Paise,
  shownIiicPaise: Paise,
})

export const RescheduleBody = z.object({ startsAt: When })

export const ConfirmTimeBody = z.object({
  startsAt: When,
  practitionerId: optional(Id),
})

/** A link's end, if the office sets one; none means the gateway's own default. */
export const PaymentLinkBody = z.object({ expiresAt: optional(When) })

export const DecideBody = z.object({ decision: z.enum(['approve', 'decline']) })

/**
 * The preview of bookable times (docs/05, Calendar): whose hours (the office picks; a
 * practitioner sees their own) and which service's option, as `serviceId:optionId`.
 */
export const PreviewQuery = z.object({
  practitionerId: optional(Id),
  option: z
    .string()
    .regex(/^\d+:[A-Za-z0-9_-]{1,64}$/)
    .transform((value) => {
      const [serviceId, serviceOption] = value.split(':') as [string, string]
      return { serviceId: Number(serviceId), serviceOption }
    }),
})

/** Parses one input, answering with the names of the fields that are wrong. */
export function parseInput<T extends z.ZodType>(
  schema: T,
  raw: unknown,
): Result<z.output<T>, InvalidInput> {
  const parsed = schema.safeParse(raw)
  if (parsed.success) return ok(parsed.data)
  return err({
    code: 'invalid-input',
    fields: [...new Set(parsed.error.issues.map((issue) => issue.path.join('.') || '(input)'))],
  })
}
