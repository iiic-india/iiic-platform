import type { PayloadRequest } from 'payload'

/**
 * The certificates module's event (docs/18 §4; docs/06, C5): `certificate.issued`, raised once
 * per certificate inside the issuing transaction, so a batch that rolls back raises nothing. M6's
 * C5 task listens and emails the holder their PDF; until then the event has no listener and
 * queues nothing. Like M3's events (src/lib/booking/events.ts), it carries the row's id only:
 * never a name, an address or the token, so no job's input or log holds anything personal.
 */

export const CERTIFICATE_ISSUED = 'certificate.issued' as const

export type CertificateEvent = { name: typeof CERTIFICATE_ISSUED; certificateId: number }

export type EmitCertificateEvent = (req: PayloadRequest, event: CertificateEvent) => Promise<void>

/** The tasks the event starts, by automation ID: M6 adds C5's task here. */
export const CERTIFICATE_LISTENERS: Readonly<Record<CertificateEvent['name'], readonly string[]>> =
  {
    [CERTIFICATE_ISSUED]: [],
  }

/** The idempotency key of an event's jobs: `certificate.issued:<id>`. */
export const certificateEventKey = (event: CertificateEvent): string =>
  `${event.name}:${event.certificateId}`

type Queue = (args: {
  task: string
  input: Record<string, unknown>
  req: PayloadRequest
}) => Promise<unknown>

/** An emitter for a set of listeners; the real one is `emitCertificateEvent`. */
export function certificateEmitterFor(
  listeners: Readonly<Record<CertificateEvent['name'], readonly string[]>>,
): EmitCertificateEvent {
  return async (req, event) => {
    const key = certificateEventKey(event)
    for (const task of listeners[event.name]) {
      await (req.payload.jobs.queue as unknown as Queue)({ task, input: { ...event, key }, req })
    }
  }
}

export const emitCertificateEvent: EmitCertificateEvent =
  certificateEmitterFor(CERTIFICATE_LISTENERS)
