import { CERTIFICATE_HEADING } from '@/lib/certificates/statement'
import type { PageContent } from '@/lib/content/types'
import { SCOPE_HEADING } from '@/lib/counselling/scope'
import { CONTACT } from '@/lib/site/contact'

/**
 * The legal pages as drafts, for the time before the lawyer's versions are in the CMS (D-52;
 * docs/12 §11 says what each page holds, and I-22's fallback is "drafts marked draft").
 *
 * Nothing here is a policy made up for the page. Every sentence states either what the site
 * does today (checked on 21 November 2026) or a rule the docs have already set: docs/08 §2
 * (who reads session notes), §3 (notices, consent, rights, children), §4 (grievances,
 * refunds, receipts), §5 (the total shown before payment), §7 (confidentiality within the
 * law's limits) and §8 (processors); docs/12 §9 and §10 (accessibility, cookies). What IIIC,
 * its lawyer or its accountant has yet to supply is a placeholder, citing the input in docs/09
 * that will supply it (D-56). Each page is marked as a draft until the lawyer has reviewed it;
 * the accessibility page is IIIC's own statement, so it is marked as candidate copy instead.
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
  // The legal pages keep plain titles and are not optimised (D-65); each description is the
  // page's own lead with the institute's full name.
  description:
    'Who runs this site for the Indian Institute of Image Catalysts (IIIC), Ahmedabad, and how to reach them.',
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
        {
          left: 'Trade name',
          right:
            'Indian Institute of Image Catalysts (IIIC) [[TODO: the trade name exactly as registered, I-26]]',
        },
        { left: 'Legal name', right: LEGAL_NAME },
        { left: 'Kind of business', right: 'Sole proprietorship' },
        {
          left: 'Address',
          right: `${CONTACT.address} [[TODO: the address as it should print, with its PIN, I-33]]`,
        },
        // The platform domain (D-05).
        { left: 'Website', right: 'imagecatalysts.in' },
        // IIIC is registered for GST; the number itself is still to come (docs/09, I-05).
        { left: 'GSTIN', right: '[[TODO: the GSTIN, I-05]]' },
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
  description:
    'What the Indian Institute of Image Catalysts (IIIC) collects through this site, why, and what you can ask IIIC to do with it.',
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
      // The Map's first mention on this page takes its full name (src/brand/VOICE.md, names).
      lead: 'Bookings, the Subjective Self Map and enquiries are still being built. Each will follow these rules.',
      points: [
        { text: 'Before a form takes your details, it tells you what is collected and why.' },
        { text: 'Each purpose has its own box, and no box is ticked for you.' },
        { text: 'A booking never depends on agreeing to a newsletter or to WhatsApp updates.' },
        {
          text: 'For a counselling booking or the Map, your consent is also confirmed by email, and you can withdraw it by replying.',
        },
        {
          text: 'Every message IIIC sends carries a way to withdraw your consent, and this page will carry one too.',
        },
        {
          // The law's limits as src/brand/VOICE.md ("Counselling copy") and the scope statement
          // name them. Whether the notes are shown to the person they are about on a request for
          // their data is the lawyer's to settle (D-11; docs/08 §10).
          text: 'Nothing said in a counselling session is used for marketing, to decide what else IIIC offers you, or for analytics. Session notes are private to the counsellor who wrote them, within the limits the law sets, including mandatory reporting where a child may be at risk. [[TODO: whether session notes are shown to the person they are about on a request for their data (D-11), I-22]]',
        },
      ],
      copyStatus: 'approved',
    },
    {
      blockType: 'statement',
      heading: 'The legal basis',
      paragraphs: [
        { text: '[[TODO: the legal basis for each purpose, the request log included, I-22]]' },
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
        {
          text: 'IIIC sends no marketing to anyone under 18 and records no analytics events about them.',
        },
      ],
      copyStatus: 'approved',
    },
    {
      blockType: 'points',
      heading: 'Who handles data for IIIC',
      lead: 'These companies run parts of the platform for IIIC.',
      points: [
        {
          text: 'Vercel runs the site and keeps the request logs. The site’s functions run in Mumbai; the company is in the United States.',
        },
        { text: 'Supabase holds the database, in Mumbai.' },
        // No place for the stored files until the R2 buckets' location setting is confirmed
        // against docs/08 §8: the notice does not guess.
        { text: 'Cloudflare runs the domain’s DNS and stores uploaded files.' },
        { text: 'Resend sends email, from Tokyo.' },
        {
          text: 'Sentry receives error reports with personal details removed, in the European Union.',
        },
        {
          text: 'Joining when their part of the platform opens: Razorpay (payments, India), Zoho Books (invoices, India), AiSensy and Meta (phone numbers and WhatsApp messages; AiSensy in India, Meta worldwide), and Google Workspace (staff mail, and staff calendars that show each booking’s time and the client’s first name; worldwide).',
        },
      ],
      copyStatus: 'approved',
    },
    {
      blockType: 'statement',
      heading: 'Your rights',
      paragraphs: [
        {
          text: 'You can ask to see the data IIIC holds about you, to have it corrected or erased, and to name someone who can make these requests for you if you die or cannot make them yourself. You can also complain about how your data was handled. We answer within 30 days.',
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
    {
      blockType: 'statement',
      heading: 'Changes to this notice',
      paragraphs: [{ text: '[[TODO: how a change to this notice is announced, I-22]]' }],
      copyStatus: 'approved',
    },
  ],
}

export const TERMS: PageContent = {
  title: 'Terms of use',
  slug: 'terms',
  description:
    'The terms for using this site and the services of the Indian Institute of Image Catalysts (IIIC), Ahmedabad.',
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
        { text: 'Who owns the framework, the Subjective Self Map and the content' },
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
  description:
    'The rules for cancelling, rescheduling and refunds at the Indian Institute of Image Catalysts (IIIC), Ahmedabad.',
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
        { text: '[[TODO: the refund timeline, I-07]]' },
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
  description:
    'How to complain to the Indian Institute of Image Catalysts (IIIC), how to ask about your data, and how soon IIIC answers.',
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
          text: 'You can ask to see the data IIIC holds about you, to have it corrected or to have it erased, and you can name someone to make these requests for you if you die or cannot make them yourself. We answer within 30 days.',
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
  description:
    'How the Indian Institute of Image Catalysts (IIIC) builds this site to meet WCAG 2.2 at level AA, what is checked, and how to report a problem.',
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
      // True while tests/e2e/site.e2e.spec.ts runs both checks on every public page, each
      // register's 404 included, at exactly the widths named here. CI's database is empty, so a
      // page published from the admin (D-54) is not among them: read this again when the first
      // page is published.
      lead: 'Every public page on the site today has passed two checks.',
      points: [
        { text: 'An automated accessibility test, on a desktop screen and on a phone.' },
        { text: 'No sideways scrolling at 320, 768 or 1600 pixels wide.' },
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
