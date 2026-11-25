import type { PayloadRequest } from 'payload'
import { Section, Text } from 'react-email'
import { z } from 'zod'

import { maskIdentifier } from '@/lib/accounts/signIn/identifier'
import { idOf } from '@/lib/privacy/consentLedger'
import { err, ok, type Result } from '@/lib/result'
import type { Person } from '@/payload-types'

import { Frame, Paragraph } from '../components/Frame'
import { EMAIL, EMAIL_FONTS } from '../palette'
import type { LoadError, TemplateImplementation } from '../types'

/**
 * The account messages (docs/20 §9; docs/06 A1 to A3; D-123). Each is transactional, carries no
 * offer, bridge or price, quotes nothing the person wrote, and says nothing about counselling.
 *
 * - A1, the code: its `load` reads the code and the address from the first try's `transient`
 *   only, and answers `stale` without them (never `not-found`, which would fail the message,
 *   B4), so a retry sends nothing. The code is in the body, never the subject or the preheader,
 *   which a phone's lock screen shows. On WhatsApp it is Meta's authentication template, whose
 *   words are Meta's: the code is its one variable (I-66).
 * - A2, the account closed: what was closed, what IIIC keeps and why, how to ask for erasure.
 * - A3, a detail added: which kind, masked, to the email held before, and what to do if it was
 *   not them.
 *
 * Copy status: candidate lines written to src/brand/VOICE.md, awaiting IIIC's approval (I-41).
 */

// scope: none of its own; each use below names the one row its message is about (D-132)
const SERVER = { overrideAccess: true, depth: 0 } as const

/** The code, large and spaced, on the kit's yellow tint (a code is read and typed, not tapped). */
function CodeBlock({ code }: { code: string }) {
  return (
    <Section
      style={{
        background: EMAIL.ticket,
        border: `1px solid ${EMAIL.ticketBorder}`,
        borderRadius: 14,
        padding: '18px 22px',
        margin: '0 0 22px',
      }}
    >
      <Text
        style={{
          margin: 0,
          fontFamily: EMAIL_FONTS.mono,
          fontSize: 30,
          lineHeight: '36px',
          letterSpacing: '6px',
          fontWeight: 'bold',
          color: EMAIL.ink,
          textAlign: 'center',
        }}
      >
        {code}
      </Text>
    </Section>
  )
}

// ---- A1 · the code ----

const CodeData = z.object({
  code: z.string().regex(/^\d{6}$/),
  purpose: z.enum(['signIn', 'addDetail']),
})
type CodeData = z.infer<typeof CodeData>

const CODE_WORDS = {
  signIn: {
    subject: 'Your IIIC sign-in code',
    heading: 'Your sign-in code',
    use: 'to sign in to My IIIC',
  },
  addDetail: {
    subject: 'Your IIIC confirmation code',
    heading: 'Your confirmation code',
    use: 'to add this address to your My IIIC account',
  },
} as const

const CODE_PREHEADER = 'It works for 10 minutes. IIIC never asks you for it.'

export const accountSignInCode: TemplateImplementation<CodeData> = {
  load: async (req, { subject, transient }): Promise<Result<CodeData, LoadError>> => {
    const code = transient?.code
    if (!code || !transient?.address) return err({ code: 'stale' })
    const row = await req.payload.findByID({
      collection: 'sign-in-requests',
      id: subject.id,
      disableErrors: true,
      select: { purpose: true },
      req,
      // scope: the sign-in request this A1 is about (the message's subject); its purpose only
      ...SERVER,
    })
    if (!row) return err({ code: 'stale' })
    return ok({ code, purpose: row.purpose })
  },
  email: {
    key: 'account-sign-in-code',
    schema: CodeData,
    subject: (data) => CODE_WORDS[data.purpose].subject,
    preheader: () => CODE_PREHEADER,
    element: (data, context) => (
      <Frame
        preheader={CODE_PREHEADER}
        eyebrow="My IIIC"
        heading={CODE_WORDS[data.purpose].heading}
        footer={context.footer}
        assetUrl={context.assetUrl}
      >
        <Paragraph>
          Enter this code {CODE_WORDS[data.purpose].use}. It works for 10 minutes.
        </Paragraph>
        <CodeBlock code={data.code} />
        <Paragraph>
          IIIC never asks for this code by phone, email or WhatsApp. Do not give it to anyone.
        </Paragraph>
        <Paragraph>
          If you did not ask for a code, ignore this email. Nobody can use the address without it.
        </Paragraph>
      </Frame>
    ),
  },
  // Meta's authentication template: its words are Meta's own; the code is the one variable.
  whatsapp: {
    key: 'account-sign-in-code',
    schema: CodeData,
    params: (data) => [data.code],
  },
}

// ---- A2 · the account closed ----

const ClosedData = z.object({ firstName: z.string() })
type ClosedData = z.infer<typeof ClosedData>

async function firstName(req: PayloadRequest, recipient: { kind: string; id: number }) {
  if (recipient.kind !== 'person') return null
  const person = (await req.payload.findByID({
    collection: 'people',
    id: recipient.id,
    disableErrors: true,
    select: { fullName: true },
    req,
    // scope: the person the message goes to (its recipient); the name only
    ...SERVER,
  })) as Pick<Person, 'fullName'> | null
  return person ? (person.fullName.trim().split(/\s+/)[0] ?? '') : null
}

const greeting = (name: string) => (name ? `Hello ${name},` : 'Hello,')

export const accountClosed: TemplateImplementation<ClosedData> = {
  load: async (req, { recipient }) => {
    const name = await firstName(req, recipient)
    return name === null ? err({ code: 'not-found' }) : ok({ firstName: name })
  },
  email: {
    key: 'account-closed',
    schema: ClosedData,
    subject: () => 'Your My IIIC account is closed',
    preheader: () => 'What closing it removed, and what IIIC keeps.',
    element: (data, context) => (
      <Frame
        preheader="What closing it removed, and what IIIC keeps."
        eyebrow="My IIIC"
        heading="Your account is closed"
        footer={context.footer}
        assetUrl={context.assetUrl}
      >
        <Paragraph>{greeting(data.firstName)}</Paragraph>
        <Paragraph>
          You closed your My IIIC account. You are signed out everywhere, nobody can sign in to it,
          and your bookings, documents and invoices are no longer gathered in one place.
        </Paragraph>
        <Paragraph>
          IIIC keeps the records of your bookings, payments, invoices and certificates, because the
          law and IIIC&rsquo;s accounts need them for a set time. Your other choices about messages
          stay as they were.
        </Paragraph>
        <Paragraph>
          To ask IIIC to erase the rest of your data, reply to this email. You can make a new
          account at any time with the same address.
        </Paragraph>
      </Frame>
    ),
  },
}

// ---- A3 · a detail added ----

const AddedData = z.object({
  firstName: z.string(),
  kind: z.enum(['mobile number', 'email address']),
  masked: z.string(),
})
type AddedData = z.infer<typeof AddedData>

export const accountDetailAdded: TemplateImplementation<AddedData> = {
  load: async (req, { subject, recipient }) => {
    const name = await firstName(req, recipient)
    if (name === null) return err({ code: 'not-found' })
    const account = await req.payload.findByID({
      collection: 'accounts',
      id: subject.id,
      disableErrors: true,
      select: { person: true },
      req,
      // scope: the account this A3 is about (the message's subject); its own record's id only
      ...SERVER,
    })
    // Closed since: nothing to tell.
    if (!account) return err({ code: 'stale' })
    const own = (await req.payload.findByID({
      collection: 'people',
      id: Number(idOf(account.person)),
      disableErrors: true,
      select: { mobile: true, mobileVerifiedAt: true },
      req,
      // scope: that account's own record; the mobile it has just proven, masked before it is shown
      ...SERVER,
    })) as Pick<Person, 'mobile' | 'mobileVerifiedAt'> | null
    if (!own?.mobile || !own.mobileVerifiedAt) return err({ code: 'stale' })
    return ok({
      firstName: name,
      kind: 'mobile number',
      masked: maskIdentifier('whatsapp', own.mobile),
    })
  },
  email: {
    key: 'account-detail-added',
    schema: AddedData,
    subject: (data) => `A ${data.kind} was added to your My IIIC account`,
    preheader: () => 'If it was not you, reply to this email.',
    element: (data, context) => (
      <Frame
        preheader="If it was not you, reply to this email."
        eyebrow="My IIIC"
        heading={`A ${data.kind} was added`}
        footer={context.footer}
        assetUrl={context.assetUrl}
      >
        <Paragraph>{greeting(data.firstName)}</Paragraph>
        <Paragraph>
          The {data.kind} {data.masked} was confirmed with a code and added to your My IIIC account.
          You can now sign in with it too.
        </Paragraph>
        <Paragraph>
          If you did not add it, reply to this email and IIIC will look into it. In My IIIC, under
          Privacy, you can also sign out of every other device.
        </Paragraph>
      </Frame>
    ),
  },
}
