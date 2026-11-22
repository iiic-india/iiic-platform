import {
  CONSULTANCY_AUDIENCE,
  CONSULTANCY_NAME,
  CONSULTANCY_SERVICES,
  type ConsultancyOffer,
  TEAM_MAP,
} from '@/lib/site/consultancy'
import { CONTACT } from '@/lib/site/contact'

import { pageSlugOf } from './paths'
import {
  canonicalPath,
  canonicalUrl,
  fact,
  FOUNDER,
  FRAMEWORK_DEFINITION,
  SITE_ALTERNATE_NAMES,
  SITE_DESCRIPTION,
  SITE_LANGUAGE,
  SITE_NAME,
  siteOrigin,
} from './site'

/**
 * The structured data of each page (plan A5; D-62, D-63, D-64): one JSON-LD @graph per page,
 * with stable @ids on the platform domain. Every value is a fact the docs record; a field whose
 * input is pending is left out, never filled with a placeholder or a guess (CLAUDE.md #1). So
 * there is no PIN or map position (I-33), no legal name (I-26), no founding date, no profile
 * links (I-34), no price or price range (D-21), and no rating or review (docs/12 §3).
 *
 * The business is one LocalBusiness node, which inherits every Organization field: never a
 * medical or health type, whose names are clinical (CLAUDE.md #9), and never an
 * EducationalOrganization, which reads as recognition the platform does not claim (docs/08 §7).
 * It is drawn in full on the home and About pages and referred to by its @id everywhere else.
 */

export type JsonLdValue = string | number | boolean | JsonLdNode | JsonLdValue[]
export type JsonLdNode = { [key: string]: JsonLdValue | undefined }
export type JsonLdGraph = { '@context': 'https://schema.org'; '@graph': JsonLdNode[] }

/** What a page's graph is built from: the page as the route has it. */
export type PageGraphInput = {
  path: string
  /** The page's search title, as its metadata has it. */
  title: string
  description?: string | null
  /** The pages above this one, nearest last: [{ path: "/organisations", title: "…" }]. */
  trail?: { path: string; title: string }[]
  /** The questions the page shows in its questions section, and only those (D-62). */
  faqs?: readonly { question: string; answer: string }[]
}

export const ids = (origin: string = siteOrigin()) => ({
  organization: `${origin}/#organization`,
  website: `${origin}/#website`,
  founder: `${origin}/about#gaurang-mistry`,
  framework: `${origin}/framework#subjective-self`,
  frameworkSet: `${origin}/framework#framework`,
})

const ref = (id: string): JsonLdNode => ({ '@id': id })

/** The office's hours, from the contact details (docs/09: Monday to Friday, 10 AM – 6 PM). */
const OPENING_HOURS: JsonLdNode = {
  '@type': 'OpeningHoursSpecification',
  dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  opens: '10:00',
  closes: '18:00',
}

/** The address as the brochures print it, without the PIN until IIIC confirms one (I-33). */
function postalAddress(): JsonLdNode {
  const street = CONTACT.address.replace(/,\s*Ahmedabad$/, '')
  return {
    '@type': 'PostalAddress',
    streetAddress: street,
    addressLocality: 'Ahmedabad',
    addressRegion: 'Gujarat',
    addressCountry: 'IN',
  }
}

/** The business itself (D-62, D-63). */
export function organizationNode(origin: string = siteOrigin()): JsonLdNode {
  const id = ids(origin)
  return {
    '@type': 'LocalBusiness',
    '@id': id.organization,
    name: SITE_NAME,
    alternateName: [...SITE_ALTERNATE_NAMES],
    url: `${origin}/`,
    logo: `${origin}/logo.png`,
    image: `${origin}/logo.png`,
    description: SITE_DESCRIPTION,
    address: postalAddress(),
    // E.164 (CLAUDE.md #8), the number the footer prints (D-31).
    telephone: CONTACT.phone.replace(/[^\d+]/g, ''),
    email: CONTACT.email,
    openingHoursSpecification: [OPENING_HOURS],
    founder: ref(id.founder),
    // Each term is IIIC's own (content/sources/iiic-philosophy-2026-11-19.md).
    knowsAbout: [
      'Subjective Self',
      'Business and management consultancy',
      'Leadership development',
      'Standard Operating Procedures (SOPs)',
      'Organisational culture',
      'Life skills education',
      'Counselling',
    ],
  }
}

/** The site, on the home page only: with og:site_name and the home title, the site's name. */
export function websiteNode(origin: string = siteOrigin()): JsonLdNode {
  const id = ids(origin)
  // No SearchAction until /search exists (plan A15).
  return {
    '@type': 'WebSite',
    '@id': id.website,
    name: SITE_NAME,
    alternateName: [...SITE_ALTERNATE_NAMES],
    url: `${origin}/`,
    inLanguage: SITE_LANGUAGE,
    publisher: ref(id.organization),
  }
}

/** The founder (D-64): his title in the brochure, no honorific, no years, no image yet. */
export function founderNode(origin: string = siteOrigin()): JsonLdNode {
  const id = ids(origin)
  return {
    '@type': 'Person',
    '@id': id.founder,
    name: FOUNDER.name,
    jobTitle: FOUNDER.jobTitle,
    worksFor: ref(id.organization),
    knowsAbout: ['Subjective Self'],
  }
}

/** The page itself. The About page is an AboutPage. */
export function webPageNode(input: PageGraphInput, origin: string = siteOrigin()): JsonLdNode {
  const id = ids(origin)
  const url = canonicalUrl(input.path, origin)
  const home = canonicalPath(input.path) === '/'
  return {
    '@type': pageSlugOf(input.path) === 'about' ? 'AboutPage' : 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: fact(input.title) ?? SITE_NAME,
    description: fact(input.description),
    inLanguage: SITE_LANGUAGE,
    isPartOf: ref(id.website),
    publisher: ref(id.organization),
    about: home ? ref(id.organization) : undefined,
    breadcrumb: home ? undefined : ref(`${url}#breadcrumb`),
  }
}

/**
 * The way down from the home page to this one, on every page below the home page. A page
 * above this one whose title is not fit to show is left out, and so is the home page in the
 * trail (a page at home/… has it there), which is already the first step; this page is always
 * the last step, under the name its WebPage node has.
 */
export function breadcrumbNode(input: PageGraphInput, origin: string = siteOrigin()): JsonLdNode {
  const url = canonicalUrl(input.path, origin)
  const trail = (input.trail ?? []).filter((step) => canonicalPath(step.path) !== '/')
  const above = [{ path: '/', title: 'Home' }, ...trail].flatMap((step) => {
    const name = fact(step.title)
    return name ? [{ path: step.path, name }] : []
  })
  const steps = [...above, { path: input.path, name: fact(input.title) ?? SITE_NAME }]
  return {
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: steps.map((step, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: step.name,
      item: canonicalUrl(step.path, origin),
    })),
  }
}

/** Subjective Self as IIIC defines it, apart from the textbook term (plan C3). */
export function frameworkNodes(origin: string = siteOrigin()): JsonLdNode[] {
  const id = ids(origin)
  return [
    {
      '@type': 'DefinedTermSet',
      '@id': id.frameworkSet,
      name: 'Subjective Self Framework',
      url: canonicalUrl('/framework', origin),
      creator: ref(id.organization),
      hasDefinedTerm: ref(id.framework),
    },
    {
      '@type': 'DefinedTerm',
      '@id': id.framework,
      name: 'Subjective Self',
      description: FRAMEWORK_DEFINITION,
      url: canonicalUrl('/framework', origin),
      inDefinedTermSet: ref(id.frameworkSet),
    },
  ]
}

/**
 * Business and management consultancy (D-62), described in IIIC's words
 * (content/sources/iiic-philosophy-2026-11-19.md) for the audience docs/09 records. The
 * individual services join with their approved names (I-11). No offer and no price (D-21).
 */
export function consultancyNode(origin: string = siteOrigin()): JsonLdNode {
  return {
    '@type': 'Service',
    '@id': `${canonicalUrl('/organisations', origin)}#service`,
    name: CONSULTANCY_NAME,
    serviceType: 'Business and management consultancy',
    description:
      'Alongside leadership development, we build organisational systems, processes and Standard Operating Procedures (SOPs) through an HR-centric approach.',
    provider: ref(ids(origin).organization),
    audience: { '@type': 'BusinessAudience', audienceType: CONSULTANCY_AUDIENCE },
  }
}

/**
 * One of the consultancy's offers on its own page (D-62): its name, the business as provider by
 * its @id, and the consultancy's audience. What each offer is, and what a client receives,
 * waits on IIIC (I-11, I-12), so the node describes neither, and it names no offer or price
 * (D-21).
 */
export function consultancyOfferNode(
  offer: ConsultancyOffer,
  origin: string = siteOrigin(),
): JsonLdNode {
  return {
    '@type': 'Service',
    '@id': `${canonicalUrl(`/${offer.slug}`, origin)}#service`,
    name: offer.name,
    serviceType: 'Business and management consultancy',
    provider: ref(ids(origin).organization),
    audience: { '@type': 'BusinessAudience', audienceType: CONSULTANCY_AUDIENCE },
  }
}

/**
 * The questions a page shows, and only those (D-62; I-20): a FAQPage that is part of the page,
 * with each question and its answer as the page shows them. A question or an answer that is
 * empty or still holds a placeholder is left out (a published question holds none,
 * src/collections/Faqs.ts); a page that shows no question has no FAQPage.
 */
export function faqNode(input: PageGraphInput, origin: string = siteOrigin()): JsonLdNode | null {
  const questions = (input.faqs ?? []).flatMap(({ question, answer }) => {
    const name = fact(question)
    const text = fact(answer)
    return name && text
      ? [{ '@type': 'Question', name, acceptedAnswer: { '@type': 'Answer', text } }]
      : []
  })
  if (questions.length === 0) return null
  const url = canonicalUrl(input.path, origin)
  return {
    '@type': 'FAQPage',
    '@id': `${url}#faq`,
    url,
    inLanguage: SITE_LANGUAGE,
    isPartOf: ref(`${url}#webpage`),
    mainEntity: questions,
  }
}

/**
 * One-to-one and family counselling (docs/09), each a Service and nothing more: no health type,
 * no offer (CLAUDE.md #3, #9). The description is IIIC's own sentence.
 */
export function counsellingNodes(origin: string = siteOrigin()): JsonLdNode[] {
  const url = canonicalUrl('/counselling', origin)
  const provider = ref(ids(origin).organization)
  return [
    {
      '@type': 'Service',
      '@id': `${url}#one-to-one`,
      name: 'One-to-one counselling',
      serviceType: 'Counselling',
      description:
        'Our counselling approach focuses on helping individuals gain clarity about themselves, their circumstances, emotions, thought processes and decisions.',
      provider,
    },
    {
      '@type': 'Service',
      '@id': `${url}#family`,
      name: 'Family counselling',
      serviceType: 'Counselling',
      provider,
    },
  ]
}

/**
 * The certification course (plan A5): the three life skills of IIIC's philosophy. Its format,
 * length, fee and dates are still to come (I-14), so the node says nothing of them, whether it
 * is free included; the certificate's wording joins with docs/08 §7, never a degree or a
 * diploma.
 */
export function courseNode(origin: string = siteOrigin()): JsonLdNode {
  return {
    '@type': 'Course',
    '@id': `${canonicalUrl('/learn', origin)}#course`,
    name: 'The Subjective Self certification course',
    description:
      'Through the Subjective Self Framework, we focus on cultivating three fundamental life skills: Discipline, Accountability and Decisiveness.',
    provider: ref(ids(origin).organization),
  }
}

/** The nodes only one page carries, by the page's slug. */
function pageNodes(slug: string, origin: string): JsonLdNode[] {
  switch (slug) {
    case 'home':
      return [organizationNode(origin), websiteNode(origin), founderNode(origin)]
    case 'about':
      return [organizationNode(origin), founderNode(origin)]
    case 'framework':
      return frameworkNodes(origin)
    case 'organisations':
      return [consultancyNode(origin)]
    case 'counselling':
      return counsellingNodes(origin)
    case 'learn':
      return [courseNode(origin)]
    default: {
      const offer = [...CONSULTANCY_SERVICES, TEAM_MAP].find((entry) => entry.slug === slug)
      return offer ? [consultancyOfferNode(offer, origin)] : []
    }
  }
}

/** Drops empty values, so a pending field is absent rather than empty. */
function compact<T extends JsonLdValue | undefined>(value: T): T | undefined {
  if (Array.isArray(value)) {
    const items = value.map((item) => compact(item)).filter((item) => item !== undefined)
    return (items.length > 0 ? items : undefined) as T | undefined
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .map(([key, item]) => [key, compact(item)] as const)
      .filter(([, item]) => item !== undefined)
    return Object.fromEntries(entries) as T
  }
  if (typeof value === 'string' && value.trim() === '') return undefined
  return value
}

/** A page's whole graph. */
export function pageGraph(input: PageGraphInput, origin: string = siteOrigin()): JsonLdGraph {
  const home = canonicalPath(input.path) === '/'
  const faq = faqNode(input, origin)
  const nodes = [
    webPageNode(input, origin),
    ...(home ? [] : [breadcrumbNode(input, origin)]),
    ...pageNodes(pageSlugOf(input.path), origin),
    ...(faq ? [faq] : []),
  ]
  return {
    '@context': 'https://schema.org',
    '@graph': nodes.map((node) => compact(node) as JsonLdNode),
  }
}

/** What a Journal article's graph is built from: its page, and the article itself. */
export type ArticleGraphInput = PageGraphInput & {
  /** The article's own title; its search title, the page's name, may be shorter. */
  headline: string
  datePublished?: string | null
  dateModified?: string | null
  /** The founder, given by his @id (D-64), or someone else by the name the article shows. */
  author: { founder: true } | { founder: false; name?: string | null }
  /** The article's first topic. */
  section?: string | null
  /** The absolute address of the article's share image. */
  image?: string
}

/**
 * A Journal article (D-62; docs/12 §3): its headline, its dates, its author and IIIC as its
 * publisher, both by @id where the graph knows them. An author who is not the founder is a
 * Person with the name the article shows and nothing more; no name, no author.
 */
export function articleNode(input: ArticleGraphInput, origin: string = siteOrigin()): JsonLdNode {
  const id = ids(origin)
  const url = canonicalUrl(input.path, origin)
  const name = input.author.founder ? undefined : fact(input.author.name)
  return {
    '@type': 'Article',
    '@id': `${url}#article`,
    headline: fact(input.headline) ?? fact(input.title) ?? SITE_NAME,
    description: fact(input.description),
    url,
    mainEntityOfPage: ref(`${url}#webpage`),
    inLanguage: SITE_LANGUAGE,
    datePublished: input.datePublished ?? undefined,
    dateModified: input.dateModified ?? input.datePublished ?? undefined,
    author: input.author.founder ? ref(id.founder) : name ? { '@type': 'Person', name } : undefined,
    publisher: ref(id.organization),
    articleSection: fact(input.section),
    image: input.image,
  }
}

/**
 * An article page's whole graph: its page and the way down to it (pageGraph), then the
 * article, and the founder's own node when he wrote it, so that the author it points at is
 * described on the page as on the home and About pages (D-64).
 */
export function articleGraph(input: ArticleGraphInput, origin: string = siteOrigin()): JsonLdGraph {
  const page = pageGraph(input, origin)
  const nodes = [articleNode(input, origin), ...(input.author.founder ? [founderNode(origin)] : [])]
  return {
    ...page,
    '@graph': [...page['@graph'], ...nodes.map((node) => compact(node) as JsonLdNode)],
  }
}

/** The graph as the text of a <script> element: "<" escaped so the data cannot end it. */
export function serializeJsonLd(graph: JsonLdGraph): string {
  return JSON.stringify(graph).replace(/</g, '\\u003c')
}
