import { CERTIFICATE_HEADING } from '@/lib/certificates/statement'
import type { PageContent } from '@/lib/content/types'
import { SCOPE_HEADING } from '@/lib/counselling/scope'
import { CONTACT } from '@/lib/site/contact'

/**
 * The legal pages as drafts, for the time before the lawyer's versions are in the CMS (D-52;
 * docs/12 §11 says what each page holds, and I-22's fallback is "drafts marked draft").
 *
 * Nothing here is a policy made up for the page. Every sentence states either what the site
 * does today (checked on 21 November 2026) or a rule the docs have already set: docs/08 §3
 * (notices, consent, rights, children), §4 (grievances, refunds, receipts), §5 (the total
 * shown before payment) and §8 (processors); docs/12 §9 and §10 (accessibility, cookies).
 * What IIIC, its lawyer or its accountant has yet to supply is a placeholder. Each page is
 * marked as a draft until the lawyer has reviewed it; the accessibility page is IIIC's own
 * statement, so it is marked as candidate copy instead.
 *
 * "What this site collects today" must be read again with every release: it changes when the
 * first form that stores an answer goes live.
 */

const GRIEVANCE = { label: 'Contact the grievance officer', href: '/grievance' }
const CONTACT_US = { label: 'Contact', href: '/about#contact' }

const LEGAL_NAME =
  '[[TODO: the proprietor’s legal name, exactly as on PAN and registrations, I-26]]'
const OFFICER = '[[TODO: the grievance officer’s name, designation and contact, I-21]]'
const REACH = `${CONTACT.email} or ${CONTACT.phone}, ${CONTACT.hours}`

export const LEGAL: PageContent = {
  title: 'Legal information',
  slug: 'legal',
  legalReview: 'draft',
  layout: [
    {
      blockType: 'hero',
      kicker: 'Legal',
      heading: 'Legal information',
      lead: 'Who runs this site, and how to reach them.',
      primary: GRIEVANCE,
      copyStatus: 'approved',
    },
    {
      blockType: 'comparison',
      heading: 'Who runs this site',
      leftLabel: 'Item',
      rightLabel: 'Detail',
      pairs: [
        { left: 'Trade name', right: 'Indian Institute of Image Catalysts (IIIC)' },
        { left: 'Legal name', right: LEGAL_NAME },
        { left: 'Kind of business', right: 'Sole proprietorship' },
        {
          left: 'Address',
          right: `${CONTACT.address} [[TODO: the address as it should print, with its PIN, I-33]]`,
        },
        { left: 'GSTIN', right: '[[TODO: the GSTIN, if IIIC is registered for GST, I-26]]' },
        { left: 'Customer care', right: REACH },
        { left: 'Grievance officer', right: OFFICER },
        { left: 'CERT-In point of contact', right: '[[TODO: name, email and phone, I-27]]' },
        {
          left: 'Dark-pattern self-audit',
          right:
            '[[TODO: the yearly certificate of compliance, shown here from 1 January 2027, I-22]]',
        },
      ],
      copyStatus: 'approved',
    },
  ],
}

export const PRIVACY: PageContent = {
  title: 'Privacy notice',
  slug: 'privacy',
  legalReview: 'draft',
  layout: [
    {
      blockType: 'hero',
      kicker: 'Legal',
      heading: 'Privacy notice',
      lead: 'What IIIC collects through this site, why, and what you can ask us to do with it.',
      primary: GRIEVANCE,
      copyStatus: 'approved',
    },
    {
      blockType: 'statement',
      heading: 'Who is responsible',
      paragraphs: [
        {
          text: 'The Indian Institute of Image Catalysts (IIIC) is responsible for the personal data collected through this site.',
        },
        { text: LEGAL_NAME },
        { text: OFFICER },
      ],
      copyStatus: 'approved',
    },
    {
      blockType: 'points',
      heading: 'What this site collects today',
      lead: 'You can read this site without giving any personal details.',
      points: [
        { text: '“Find your path” asks one question and stores nothing about you.' },
        {
          text: 'The servers that deliver the site keep a log of requests: the page asked for, the time, the IP address and the browser. The log is used to keep the site secure and working.',
        },
        {
          text: 'The site sets no cookies when you read it, so it shows no cookie banner. Cookies are set only for IIIC’s staff when they sign in.',
        },
        { text: 'There are no advertising trackers.' },
      ],
      copyStatus: 'approved',
    },
    {
      blockType: 'points',
      heading: 'When bookings and other forms open',
      lead: 'Bookings, the Map and enquiries are still being built. Each will follow these rules.',
      points: [
        { text: 'Before a form takes your details, it tells you what is collected and why.' },
        { text: 'Each purpose has its own box, and no box is ticked for you.' },
        { text: 'A booking never depends on agreeing to a newsletter or to WhatsApp updates.' },
        {
          text: 'For a counselling booking, your consent is also confirmed by email, and you can withdraw it by replying.',
        },
        { text: 'Every message IIIC sends carries a way to withdraw your consent.' },
        {
          text: 'Nothing said in a counselling session is used for marketing or analytics. Session notes can be read only by the counsellor who wrote them.',
        },
      ],
      copyStatus: 'approved',
    },
    {
      blockType: 'statement',
      heading: 'Children',
      paragraphs: [
        {
          text: 'If you are under 18, a parent or guardian makes the booking and gives the consent.',
        },
        { text: 'IIIC sends no marketing to anyone under 18 and records no analytics for them.' },
      ],
      copyStatus: 'approved',
    },
    {
      blockType: 'points',
      heading: 'Who handles data for IIIC',
      lead: 'These companies run parts of the platform for IIIC.',
      points: [
        {
          text: 'Vercel runs the site and keeps the request logs. Its servers for this site are in Mumbai; the company is in the United States.',
        },
        { text: 'Supabase holds the database, in Mumbai.' },
        { text: 'Cloudflare runs the domain’s DNS and stores uploaded files.' },
        { text: 'Resend sends email, from Tokyo.' },
        {
          text: 'Sentry receives error reports with personal details removed, in the European Union.',
        },
        {
          text: 'Joining when their part of the platform opens: Razorpay (payments, India), Zoho Books (invoices, India), AiSensy and Meta (WhatsApp messages), and Google Workspace (staff mail and calendars).',
        },
      ],
      copyStatus: 'approved',
    },
    {
      blockType: 'statement',
      heading: 'Your rights',
      paragraphs: [
        {
          text: 'You can ask to see the data IIIC holds about you, to have it corrected or erased, and you can complain about how it was handled. We answer within 30 days.',
        },
      ],
      action: { label: 'How to make a request', href: '/grievance' },
      copyStatus: 'approved',
    },
    {
      blockType: 'statement',
      heading: 'How long data is kept',
      paragraphs: [
        {
          text: '[[TODO: how long each kind of record is kept, confirmed by the lawyer and the accountant, I-22]]',
        },
      ],
      copyStatus: 'approved',
    },
  ],
}

export const TERMS: PageContent = {
  title: 'Terms of use',
  slug: 'terms',
  legalReview: 'draft',
  layout: [
    {
      blockType: 'hero',
      kicker: 'Legal',
      heading: 'Terms of use',
      lead: 'The terms for using this site and IIIC’s services.',
      primary: GRIEVANCE,
      copyStatus: 'approved',
    },
    {
      blockType: 'statement',
      heading: 'The terms',
      paragraphs: [{ text: '[[TODO: the terms of use, drafted with IIIC’s lawyer, I-22]]' }],
      copyStatus: 'approved',
    },
    {
      blockType: 'points',
      heading: 'What they will cover',
      points: [
        { text: 'Use of the site and the services' },
        { text: 'Bookings' },
        { text: 'Conduct' },
        { text: 'Who owns the framework, the Map and the content' },
        { text: 'Limits of liability' },
        { text: 'The governing law, with courts in Gujarat' },
        { text: 'How the terms change' },
      ],
      copyStatus: 'approved',
    },
    {
      blockType: 'cards',
      heading: 'Statements already on the site',
      cards: [
        { title: SCOPE_HEADING, href: '/counselling#scope', action: 'Read the statement' },
        { title: CERTIFICATE_HEADING, href: '/learn#certificate', action: 'Read the statement' },
      ],
      copyStatus: 'approved',
    },
  ],
}

export const REFUNDS: PageContent = {
  title: 'Cancellations and refunds',
  slug: 'refunds',
  legalReview: 'draft',
  layout: [
    {
      blockType: 'hero',
      kicker: 'Legal',
      heading: 'Cancellations and refunds',
      lead: 'The rules for cancelling, rescheduling and refunds.',
      primary: GRIEVANCE,
      copyStatus: 'approved',
    },
    {
      blockType: 'statement',
      heading: 'Today',
      paragraphs: [{ text: 'This site takes no payments yet.' }],
      copyStatus: 'approved',
    },
    {
      blockType: 'points',
      heading: 'What the rules will hold to',
      points: [
        { text: 'You see the full amount before you pay, and it does not grow afterwards.' },
        {
          text: 'If IIIC charges for a late cancellation, IIIC pays the same when it cancels late.',
        },
        { text: 'A refund goes back to the payment method you used.' },
        { text: 'Every payment gets a receipt.' },
      ],
      copyStatus: 'approved',
    },
    {
      blockType: 'statement',
      heading: 'The rules for each service',
      paragraphs: [
        {
          text: '[[TODO: the cancellation, reschedule, no-show and refund rules for each service, I-07]]',
        },
        { text: '[[TODO: the refund timeline, D-16]]' },
        {
          text: '[[TODO: payment methods, fees, charge-backs and the payment provider’s contact, I-04]]',
        },
      ],
      copyStatus: 'approved',
    },
  ],
}

export const GRIEVANCES: PageContent = {
  title: 'Grievance officer',
  slug: 'grievance',
  legalReview: 'draft',
  layout: [
    {
      blockType: 'hero',
      kicker: 'Legal',
      heading: 'Grievance officer',
      lead: 'How to complain, how to ask about your data, and how soon IIIC answers.',
      primary: CONTACT_US,
      copyStatus: 'approved',
    },
    {
      blockType: 'statement',
      heading: 'Who to write to',
      paragraphs: [
        { text: OFFICER },
        {
          text: `Until the officer is named, write to ${CONTACT.email} or call ${CONTACT.phone}, ${CONTACT.hours}.`,
        },
      ],
      copyStatus: 'approved',
    },
    {
      blockType: 'steps',
      heading: 'How a complaint is handled',
      steps: [
        { title: 'You write or call', text: 'Tell us what happened and how to reach you.' },
        { title: 'We acknowledge it within 48 hours' },
        { title: 'We resolve it within one month' },
      ],
      copyStatus: 'approved',
    },
    {
      blockType: 'statement',
      heading: 'Requests about your data',
      paragraphs: [
        {
          text: 'You can ask to see the data IIIC holds about you, to have it corrected or to have it erased. We answer within 30 days.',
        },
        { text: 'Before we act, we check that the request comes from you.' },
      ],
      copyStatus: 'approved',
    },
    {
      blockType: 'statement',
      heading: 'If you are not satisfied',
      paragraphs: [
        {
          text: '[[TODO: the National Consumer Helpline details, once IIIC has joined it, from 1 January 2027, I-22]]',
        },
      ],
      copyStatus: 'approved',
    },
  ],
}

export const ACCESSIBILITY: PageContent = {
  title: 'Accessibility',
  slug: 'accessibility',
  layout: [
    {
      blockType: 'hero',
      kicker: 'This site',
      heading: 'Accessibility',
      lead: 'This site is built to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA.',
      primary: CONTACT_US,
      copyStatus: 'candidate',
    },
    {
      blockType: 'points',
      heading: 'What is checked',
      lead: 'Every page on the site today has passed two checks.',
      points: [
        { text: 'An automated accessibility test, on a desktop screen and on a phone.' },
        { text: 'No sideways scrolling at 320 pixels wide and wider.' },
      ],
      copyStatus: 'candidate',
    },
    {
      blockType: 'statement',
      heading: 'Still to come',
      paragraphs: [
        {
          text: 'The full statement is written before the site opens: what was tested with a keyboard and with screen readers, the known issues, and the date of the last review.',
        },
      ],
      copyStatus: 'candidate',
    },
    {
      blockType: 'statement',
      heading: 'Found a problem?',
      paragraphs: [
        { text: `Write to ${CONTACT.email} or call ${CONTACT.phone}.` },
        { text: 'We reply within five working days.' },
      ],
      copyStatus: 'candidate',
    },
  ],
}

/** The pages a lawyer reviews before launch (I-22), by slug. */
export const LEGAL_PAGES = [LEGAL, PRIVACY, TERMS, REFUNDS, GRIEVANCES] as const
