import 'server-only'

import { inTransaction, keepOk } from '@/lib/booking/guard'
import { err, ok } from '@/lib/result'
import type { Booking, Lead, Person } from '@/payload-types'

import type { AttachCall } from '../leads'
import { CALL_STAGE, type LeadStage } from '../stages'
import { logActivity } from './activities'
import { idOf } from './actor'
import { keysFor, matchLeads, matchOrganisation } from './match'
import { applyMove, isEarlier } from './moves'

/**
 * A proposal call booked through the booking flow (P2; docs/17 §3, §8; src/lib/pipeline/leads.ts,
 * AttachCall), on M3's `booking.confirmed`. Only a proposal call (`type: 'call'`) is the CRM's:
 * for any other booking, a counselling session above all, nothing beyond its kind is read and
 * nothing is written (CLAUDE.md #3). The person is the booking's; the organisation is matched
 * from the call's company details and the person's work email, else the person's own, else made
 * from the company's name; the lead is its open consultancy lead, else a new one. Idempotent per
 * booking: a call already on a lead is not attached twice.
 */

const CONSULTANCY = 'consultancy' as const

export const attachCall: AttachCall = (req, { bookingId }) =>
  inTransaction(
    req,
    async () => {
      const booking = (await req.payload.findByID({
        collection: 'bookings',
        id: bookingId,
        depth: 0,
        disableErrors: true,
        overrideAccess: true,
        select: { type: true },
        req,
      })) as Pick<Booking, 'id' | 'type'> | null
      if (!booking || booking.type !== 'call') return err({ code: 'not-found' as const })

      const { docs: attached } = await req.payload.find({
        collection: 'leads',
        where: { calls: { in: [bookingId] } },
        limit: 1,
        depth: 0,
        pagination: false,
        overrideAccess: true,
        req,
      })
      if (attached[0]) return ok({ leadId: attached[0].id, created: false })

      const call = (await req.payload.findByID({
        collection: 'bookings',
        id: bookingId,
        depth: 0,
        overrideAccess: true,
        req,
      })) as Booking
      const personId = idOf(call.person)
      const person =
        personId === null
          ? null
          : ((await req.payload.findByID({
              collection: 'people',
              id: personId,
              depth: 0,
              disableErrors: true,
              overrideAccess: true,
              req,
            })) as Person | null)

      const companyName = call.company?.name?.trim() ?? ''
      const keys = keysFor({ name: companyName, email: person?.email })
      let organisationId =
        (await matchOrganisation(req, CONSULTANCY, keys, person?.email)) ??
        idOf(person?.organisation)
      if (organisationId === null && companyName) {
        const organisation = await req.payload.create({
          collection: 'organisations',
          data: {
            name: companyName,
            type: 'business',
            sector: call.company?.sector ?? undefined,
            domain: keys.domain ?? undefined,
            nameKey: keys.nameKey,
          },
          depth: 0,
          overrideAccess: true,
          req,
        })
        organisationId = organisation.id
      }

      const owners = { organisation: organisationId, person: personId }
      const { openLeadId, previousLeadId } = await matchLeads(req, CONSULTANCY, owners)
      let lead: Lead
      if (openLeadId !== null) {
        lead = (await req.payload.findByID({
          collection: 'leads',
          id: openLeadId,
          depth: 0,
          overrideAccess: true,
          req,
        })) as Lead
      } else {
        lead = (await req.payload.create({
          collection: 'leads',
          data: {
            kind: CONSULTANCY,
            stage: 'new',
            organisation: organisationId ?? undefined,
            person: personId ?? undefined,
            source: 'proposalCall',
            previousLead: previousLeadId ?? undefined,
          },
          depth: 0,
          overrideAccess: true,
          req,
        })) as Lead
      }

      const calls = (lead.calls ?? []).map(idOf).filter((id): id is number => id !== null)
      await req.payload.update({
        collection: 'leads',
        id: lead.id,
        data: { calls: [...calls, bookingId] },
        depth: 0,
        overrideAccess: true,
        req,
      })
      const logged = await logActivity(req, {
        leadId: lead.id,
        type: 'booking',
        by: null,
        about: { bookingId },
      })
      if (!logged.ok) return logged
      if (isEarlier(CONSULTANCY, lead.stage as LeadStage, CALL_STAGE)) {
        const moved = await applyMove(req, { leadId: lead.id, to: CALL_STAGE, by: null })
        if (!moved.ok) return moved
      }
      return ok({ leadId: lead.id, created: openLeadId === null })
    },
    keepOk,
  )
