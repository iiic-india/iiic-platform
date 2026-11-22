// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { STARTER_PAGES } from '@/content/starter'
import { pagePath } from '@/lib/content/slug'
import { MAP_PAGE } from '@/lib/seo/appPages'
import { pageGraph, type PageGraphInput, serializeJsonLd } from '@/lib/seo/schema'
import {
  FOUNDER,
  FRAMEWORK_DEFINITION,
  HOME_TITLE,
  SITE_DESCRIPTION,
  SITE_NAME,
} from '@/lib/seo/site'
import { CONTACT, telHref } from '@/lib/site/contact'

// The structured data of every page (src/lib/seo/schema.ts; D-62, D-63, D-64; plan A5). Each
// graph is read here as a crawler reads it: serialised for the script element, then parsed.

/** A fake origin, so that nothing here depends on the machine's own site URL. */
const ORIGIN = 'https://fake.example'

type Json = string | number | boolean | null | Json[] | { [key: string]: Json }
type Node = { [key: string]: Json }

/** A page as its route hands it to the graph: the home page under the site's fixed title. */
const starter = (slug: string): PageGraphInput => ({
  path: pagePath(slug),
  title: slug === 'home' ? HOME_TITLE : (STARTER_PAGES[slug]?.title ?? ''),
  description: STARTER_PAGES[slug]?.description,
})

/** A page under another, as a service's page will be. Obviously fake. */
const NESTED: PageGraphInput = {
  path: '/organisations/fake-service',
  title: 'Fake service',
  description: 'A fake description of a fake service.',
  trail: [{ path: '/organisations', title: STARTER_PAGES.organisations?.title ?? '' }],
}

/** Every starter page, Find your path, and a nested page. */
const PAGES: PageGraphInput[] = [...Object.keys(STARTER_PAGES).map(starter), MAP_PAGE, NESTED]

type Graph = { '@context': string; '@graph': Node[] }

/** A page's graph as a crawler reads it. */
const read = (input: PageGraphInput) =>
  JSON.parse(serializeJsonLd(pageGraph(input, ORIGIN))) as Graph

const graphOf = (path: string) => {
  const input = PAGES.find((page) => page.path === path)
  if (!input) throw new Error(`No test page at ${path}`)
  return read(input)['@graph']
}

const isNode = (value: Json | undefined): value is Node =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Every object in a value, the nested ones included. */
function objects(value: Json): Node[] {
  if (Array.isArray(value)) return value.flatMap(objects)
  if (isNode(value)) return [value, ...Object.values(value).flatMap(objects)]
  return []
}

/** Every string a value holds: the values, not the names of the fields. */
function strings(value: Json): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(strings)
  if (isNode(value)) return Object.values(value).flatMap(strings)
  return []
}

/** A node another node only points at: `{ "@id": … }` and nothing else. */
const isReference = (node: Node) => Object.keys(node).length === 1 && '@id' in node

/** The nodes a graph defines, by @id. */
const defined = (graph: Node[]) =>
  objects(graph)
    .filter((node) => '@id' in node && !isReference(node))
    .map((node) => String(node['@id']))

const ofType = (graph: Node[], ...types: string[]) =>
  graph.filter((node) => types.includes(String(node['@type'])))

const one = (graph: Node[], ...types: string[]): Node => {
  const found = ofType(graph, ...types)
  expect(found, types.join(' or ')).toHaveLength(1)
  return found[0] as Node
}

/** Types a platform page never carries: health types, recognition types, ratings, offers. */
const BANNED_TYPE =
  /^(?:Medical|Psychiatric|Physician|Hospital|HealthAndBeautyBusiness|EducationalOrganization|CollegeOrUniversity|School|AggregateRating|Review|Offer)/

/** Every type the graphs use today. A new one is added here on purpose, with its decision. */
const KNOWN_TYPES = [
  'AboutPage',
  'BreadcrumbList',
  'BusinessAudience',
  'Course',
  'DefinedTerm',
  'DefinedTermSet',
  'EntryPoint',
  'ListItem',
  'LocalBusiness',
  'OpeningHoursSpecification',
  'Person',
  'PostalAddress',
  'SearchAction',
  'Service',
  'WebPage',
  'WebSite',
]

/** Fields that wait on an input from IIIC, or that the platform never states (D-62, D-64). */
const BANNED_KEYS = [
  'postalCode',
  'geo',
  'legalName',
  'foundingDate',
  'taxID',
  'vatID',
  'priceRange',
  'offers',
  'price',
  'areaServed',
  'sameAs',
  'aggregateRating',
  'review',
  'parentOrganization',
  'honorificPrefix',
]

/**
 * Words no value may hold: clinical words (CLAUDE.md #9), degree and recognition words
 * (docs/08 §7), claims no one can prove (docs/08 §6), and Ankvishwa (D-26).
 */
const BANNED_WORDS =
  /\b(?:therap(?:y|ies|ist|ists|eutic)|psychologists?|clinical|diagnos[ei]s|diagnostic|treatments?|degrees?|diplomas?|accredit(?:ed|ation)|recogni[sz]ed|affiliat(?:ed|ion)|guarantee[ds]?|best|leading|top-rated|no\.\s?1|first ever|ankvishwa)\b/i

/** A price, however it is written (D-21). */
const PRICE = /₹|\bRs\b|\bINR\b/

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('the checks themselves', () => {
  it('catch each word and each way of writing a price, and leave IIIC’s own words alone', () => {
    for (const bad of [
      'Family therapy',
      'A therapist',
      'A psychologist',
      'Non-clinical sessions',
      'A diagnosis',
      'Treatment plans',
      'A degree',
      'A diploma',
      'An accredited course',
      'A recognised certificate',
      'Affiliated to a university',
      'Guaranteed results',
      'The best consultant',
      'A leading institute',
      'A top-rated course',
      'Ahmedabad’s No. 1 counsellor',
      'The first ever Indian theory',
      'An initiative by Ankvishwa',
    ]) {
      expect(bad, bad).toMatch(BANNED_WORDS)
    }
    for (const ok of [
      'Leadership development',
      'a psychological framework',
      'One-to-one counselling',
      'The Subjective Self certification course',
      SITE_DESCRIPTION,
      FRAMEWORK_DEFINITION,
    ]) {
      expect(ok, ok).not.toMatch(BANNED_WORDS)
    }
    for (const bad of ['₹500', 'Rs. 500', 'Rs 500', 'INR 500']) expect(bad, bad).toMatch(PRICE)
    for (const ok of ['SMEs', 'Standard Operating Procedures (SOPs)', 'founders']) {
      expect(ok, ok).not.toMatch(PRICE)
    }
    for (const bad of ['MedicalBusiness', 'Psychiatric', 'EducationalOrganization', 'Offer']) {
      expect(bad, bad).toMatch(BANNED_TYPE)
    }
  })

  it('cover every starter page, Find your path and a nested page', () => {
    expect(PAGES.map((page) => page.path)).toEqual([
      ...Object.keys(STARTER_PAGES).map(pagePath),
      '/map',
      '/organisations/fake-service',
    ])
    for (const page of PAGES) expect(page.title, page.path).not.toBe('')
  })
})

describe.each(PAGES.map((page) => [page.path, page] as const))('the graph of %s', (path, input) => {
  const url = path === '/' ? `${ORIGIN}/` : `${ORIGIN}${path}`

  it('serialises to JSON that parses back to the same graph', () => {
    const built = pageGraph(input, ORIGIN)
    const parsed = read(input)
    expect(parsed).toEqual(built)
    expect(parsed['@context']).toBe('https://schema.org')
    expect(parsed['@graph'].length).toBeGreaterThan(0)
    for (const node of parsed['@graph']) {
      expect(node['@type'], JSON.stringify(node)).toBeTypeOf('string')
      expect(node['@id'], JSON.stringify(node)).toBeTypeOf('string')
    }
  })

  it('holds no placeholder, no empty value and nothing left undefined', () => {
    const { '@graph': graph } = read(input)
    for (const text of strings(graph)) {
      expect(text, text).not.toMatch(/\[\[|\]\]|TODO/)
      expect(text.trim(), 'an empty string').not.toBe('')
    }
    for (const node of objects(graph)) {
      for (const [key, value] of Object.entries(node)) {
        expect(value, key).not.toBeNull()
        if (Array.isArray(value)) expect(value.length, key).toBeGreaterThan(0)
        if (isNode(value)) expect(Object.keys(value).length, key).toBeGreaterThan(0)
      }
    }
  })

  it('uses no health, recognition, rating or offer type, and only types this test knows', () => {
    for (const node of objects(read(input)['@graph'])) {
      if (!('@type' in node)) continue
      const type = String(node['@type'])
      expect(type, type).not.toMatch(BANNED_TYPE)
      expect(KNOWN_TYPES, type).toContain(type)
    }
  })

  it('leaves out every field whose input is pending, and every field never used', () => {
    const keys = new Set(objects(read(input)['@graph']).flatMap((node) => Object.keys(node)))
    for (const key of BANNED_KEYS) expect(keys.has(key), key).toBe(false)
    // The course says nothing of its fee, dates or credential until I-14 supplies them.
    for (const key of [
      'isAccessibleForFree',
      'hasCourseInstance',
      'educationalCredentialAwarded',
    ]) {
      expect(keys.has(key), key).toBe(false)
    }
  })

  it('holds no clinical, degree, recognition or superlative word, and no price', () => {
    for (const text of strings(read(input)['@graph'])) {
      expect(text, text).not.toMatch(BANNED_WORDS)
      expect(text, text).not.toMatch(PRICE)
    }
  })

  it('gives each node its own @id, on the origin', () => {
    const ids = defined(read(input)['@graph'])
    expect(new Set(ids).size, ids.join('\n')).toBe(ids.length)
    for (const node of objects(read(input)['@graph'])) {
      for (const key of ['@id', 'url', 'item', 'logo', 'image']) {
        if (key in node) expect(String(node[key]).startsWith(`${ORIGIN}/`), key).toBe(true)
      }
    }
  })

  it('points only at nodes this graph, the home page’s or the About page’s defines', () => {
    const graph = read(input)['@graph']
    const known = new Set([
      ...defined(graph),
      ...defined(graphOf('/')),
      ...defined(graphOf('/about')),
    ])
    const references = objects(graph).filter(isReference)
    expect(references.length).toBeGreaterThan(0)
    for (const reference of references) {
      expect(known.has(String(reference['@id'])), String(reference['@id'])).toBe(true)
    }
  })

  it('describes the page itself: its URL, its title and its description', () => {
    const page = one(read(input)['@graph'], 'WebPage', 'AboutPage')
    expect(page['@type']).toBe(path === '/about' ? 'AboutPage' : 'WebPage')
    expect(page['@id']).toBe(`${url}#webpage`)
    expect(page.url).toBe(url)
    expect(page.name).toBe(input.title)
    expect(page.description).toBe(input.description)
    expect(page.inLanguage).toBe('en-IN')
    expect(page.isPartOf).toEqual({ '@id': `${ORIGIN}/#website` })
    expect(page.publisher).toEqual({ '@id': `${ORIGIN}/#organization` })
  })

  it('carries the business in full on the home and About pages only, the site on the home page only', () => {
    const graph = read(input)['@graph']
    const full = path === '/' || path === '/about'
    expect(ofType(graph, 'LocalBusiness')).toHaveLength(full ? 1 : 0)
    expect(ofType(graph, 'Person')).toHaveLength(full ? 1 : 0)
    expect(ofType(graph, 'WebSite')).toHaveLength(path === '/' ? 1 : 0)
    // Everywhere else the business is only pointed at.
    if (!full) expect(defined(graph)).not.toContain(`${ORIGIN}/#organization`)
  })

  it(
    path === '/'
      ? 'has no breadcrumb: the home page is where they start'
      : 'has a breadcrumb from the home page down to the page itself',
    () => {
      const graph = read(input)['@graph']
      const page = one(graph, 'WebPage', 'AboutPage')
      if (path === '/') {
        expect(ofType(graph, 'BreadcrumbList')).toHaveLength(0)
        expect(page.breadcrumb).toBeUndefined()
        return
      }
      const breadcrumb = one(graph, 'BreadcrumbList')
      expect(breadcrumb['@id']).toBe(`${url}#breadcrumb`)
      expect(page.breadcrumb).toEqual({ '@id': `${url}#breadcrumb` })
      const steps = breadcrumb.itemListElement as Node[]
      expect(steps.map((step) => step['@type'])).toEqual(steps.map(() => 'ListItem'))
      expect(steps.map((step) => step.position)).toEqual(steps.map((_, index) => index + 1))
      expect(steps[0]).toMatchObject({ name: 'Home', item: `${ORIGIN}/` })
      expect(steps.at(-1)).toMatchObject({ name: input.title, item: url })
      expect(steps).toHaveLength(2 + (input.trail?.length ?? 0))
    },
  )
})

describe('the business (D-62, D-63)', () => {
  const business = (path: string) => one(graphOf(path), 'LocalBusiness')

  it('is the same node on the home and About pages', () => {
    expect(business('/')).toEqual(business('/about'))
    expect(business('/')['@id']).toBe(`${ORIGIN}/#organization`)
  })

  it('carries the recorded facts, and nothing else', () => {
    expect(business('/')).toEqual({
      '@type': 'LocalBusiness',
      '@id': `${ORIGIN}/#organization`,
      name: 'Indian Institute of Image Catalysts',
      alternateName: ['IIIC'],
      url: `${ORIGIN}/`,
      logo: `${ORIGIN}/logo.png`,
      image: `${ORIGIN}/logo.png`,
      description: SITE_DESCRIPTION,
      address: {
        '@type': 'PostalAddress',
        streetAddress:
          '408, The Claywalls, above Bonanza Salon, Zydus Hospital Lane, Hebatpur Road',
        addressLocality: 'Ahmedabad',
        addressRegion: 'Gujarat',
        addressCountry: 'IN',
      },
      telephone: '+919624046464',
      email: 'info@iiicedu.com',
      openingHoursSpecification: [
        {
          '@type': 'OpeningHoursSpecification',
          dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
          opens: '10:00',
          closes: '18:00',
        },
      ],
      founder: { '@id': `${ORIGIN}/about#gaurang-mistry` },
      knowsAbout: [
        'Subjective Self',
        'Business and management consultancy',
        'Leadership development',
        'Standard Operating Procedures (SOPs)',
        'Organisational culture',
        'Life skills education',
        'Counselling',
      ],
    })
  })

  it('gives the footer’s phone number in E.164, and the footer’s email (D-31)', () => {
    const { telephone, email } = business('/')
    // The link the footer dials, without its scheme (CLAUDE.md #8).
    expect(telephone).toBe(telHref(CONTACT.phone).replace(/^tel:/, ''))
    expect(String(telephone)).toMatch(/^\+91\d{10}$/)
    expect(email).toBe(CONTACT.email)
  })

  it('gives the address the footer prints, in its parts, without a PIN (I-33)', () => {
    const address = business('/').address as Node
    expect(`${String(address.streetAddress)}, ${String(address.addressLocality)}`).toBe(
      CONTACT.address,
    )
    expect(strings(address).join(' ')).not.toMatch(/\b\d{6}\b/)
  })

  it('gives the hours the contact details give', () => {
    const [hours, ...others] = business('/').openingHoursSpecification as Node[]
    expect(others).toHaveLength(0)
    const days = hours?.dayOfWeek as string[]
    /** "18:00" as the contact details write it: "6 PM". */
    const clock = (time: Json | undefined) => {
      const [hour = 0, minutes = 0] = String(time).split(':').map(Number)
      expect(minutes).toBe(0)
      return `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`
    }
    expect(`${days[0]} to ${days.at(-1)}, ${clock(hours?.opens)} – ${clock(hours?.closes)}`).toBe(
      CONTACT.hours,
    )
    expect(days).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
  })
})

describe('the site and the founder (D-63, D-64)', () => {
  it('names the site in full on the home page, with its search at /search', () => {
    expect(one(graphOf('/'), 'WebSite')).toEqual({
      '@type': 'WebSite',
      '@id': `${ORIGIN}/#website`,
      name: SITE_NAME,
      alternateName: ['IIIC'],
      url: `${ORIGIN}/`,
      inLanguage: 'en-IN',
      publisher: { '@id': `${ORIGIN}/#organization` },
      // The address the site's search form sends (src/components/search/SearchForm.tsx).
      potentialAction: {
        '@type': 'SearchAction',
        target: { '@type': 'EntryPoint', urlTemplate: `${ORIGIN}/search?q={search_term_string}` },
        'query-input': 'required name=search_term_string',
      },
    })
    expect(one(graphOf('/'), 'WebPage').about).toEqual({ '@id': `${ORIGIN}/#organization` })
  })

  it('names the founder by his title in the brochure: no honorific, no years, no image', () => {
    const founder = one(graphOf('/about'), 'Person')
    expect(founder).toEqual({
      '@type': 'Person',
      '@id': `${ORIGIN}/about#gaurang-mistry`,
      name: FOUNDER.name,
      jobTitle: FOUNDER.jobTitle,
      worksFor: { '@id': `${ORIGIN}/#organization` },
      knowsAbout: ['Subjective Self'],
    })
    expect(founder).toEqual(one(graphOf('/'), 'Person'))
    expect(String(founder.name)).not.toMatch(/\b(?:Dr|Mr|Shri)\b\.?/)
  })
})

describe('the nodes one page carries', () => {
  const sources = (name: string) =>
    readFileSync(join(process.cwd(), 'docs/content/sources', name), 'utf8')
      .replace(/\*\*/g, '')
      .replace(/\s+/g, ' ')
  const philosophy = sources('iiic-philosophy-2026-11-19.md')
  const description = sources('iiic-description-2026-11-04.md')

  /** The nodes besides the page and its breadcrumb. */
  const own = (path: string) =>
    graphOf(path).filter(
      (node) => !['WebPage', 'AboutPage', 'BreadcrumbList'].includes(String(node['@type'])),
    )

  it('/framework defines Subjective Self in IIIC’s sentence, word for word', () => {
    const term = one(graphOf('/framework'), 'DefinedTerm')
    expect(term).toEqual({
      '@type': 'DefinedTerm',
      '@id': `${ORIGIN}/framework#subjective-self`,
      name: 'Subjective Self',
      description: FRAMEWORK_DEFINITION,
      url: `${ORIGIN}/framework`,
      inDefinedTermSet: { '@id': `${ORIGIN}/framework#framework` },
    })
    expect(description).toContain(String(term.description))
    const set = one(graphOf('/framework'), 'DefinedTermSet')
    expect(set.hasDefinedTerm).toEqual({ '@id': term['@id'] })
    expect(set.creator).toEqual({ '@id': `${ORIGIN}/#organization` })
    expect(own('/framework')).toHaveLength(2)
  })

  it('/organisations offers consultancy in IIIC’s words, for the audience docs/09 records', () => {
    const [service, ...others] = own('/organisations')
    expect(others).toHaveLength(0)
    expect(service).toMatchObject({
      '@type': 'Service',
      '@id': `${ORIGIN}/organisations#service`,
      name: 'Business & Management Consultancy',
      provider: { '@id': `${ORIGIN}/#organization` },
      audience: {
        '@type': 'BusinessAudience',
        audienceType: 'Founders, business owners and SME/MSME leaders',
      },
    })
    expect(philosophy).toContain(String(service?.name))
    expect(philosophy).toContain(String(service?.description))
    const inputs = readFileSync(join(process.cwd(), 'docs/09-content-and-inputs.md'), 'utf8')
    expect(inputs).toContain('"founders, business owners and SME/MSME leaders"')
  })

  it('/counselling offers two services and nothing clinical (CLAUDE.md #3, #9)', () => {
    const services = own('/counselling')
    expect(
      services.map((service) => [service['@type'], service.name, service.serviceType]),
    ).toEqual([
      ['Service', 'One-to-one counselling', 'Counselling'],
      ['Service', 'Family counselling', 'Counselling'],
    ])
    for (const service of services) {
      expect(service.provider).toEqual({ '@id': `${ORIGIN}/#organization` })
      // A service and nothing more: no offer, no audience, no health field.
      expect(Object.keys(service).sort()).toEqual(
        ['@id', '@type', 'name', 'provider', 'serviceType', 'description']
          .filter((key) => key in service)
          .sort(),
      )
      if ('description' in service) expect(description).toContain(String(service.description))
    }
  })

  it('/learn describes the course by the philosophy’s three life skills, and says nothing of a fee', () => {
    const [course, ...others] = own('/learn')
    expect(others).toHaveLength(0)
    expect(course).toEqual({
      '@type': 'Course',
      '@id': `${ORIGIN}/learn#course`,
      name: 'The Subjective Self certification course',
      description:
        'Through the Subjective Self Framework, we focus on cultivating three fundamental life skills: Discipline, Accountability and Decisiveness.',
      provider: { '@id': `${ORIGIN}/#organization` },
    })
    // IIIC's sentence, then its list's three names (the source sets them out as a list).
    const [lead = '', skills = ''] = String(course?.description).split(': ')
    expect(philosophy).toContain(`${lead}:`)
    for (const skill of skills.replace(/\.$/, '').split(/, | and /)) {
      expect(philosophy, skill).toContain(`- ${skill}:`)
    }
  })

  it('every other page carries only itself and its breadcrumb', () => {
    const withOwnNodes = [
      '/',
      '/about',
      '/framework',
      '/organisations',
      // Each of the consultancy's offers, as a Service (tests/unit/consultancyPages.spec.tsx).
      '/organisations/organisation-planning',
      '/organisations/marketing-and-sales',
      '/organisations/brand-positioning',
      '/organisations/team-map',
      '/counselling',
      '/learn',
    ]
    for (const page of PAGES) {
      if (withOwnNodes.includes(page.path)) continue
      expect(own(page.path), page.path).toHaveLength(0)
    }
  })
})

describe('a breadcrumb', () => {
  it('names the pages above a nested page, in order, by their titles', () => {
    const steps = one(read(NESTED)['@graph'], 'BreadcrumbList').itemListElement as Node[]
    expect(steps.map((step) => [step.position, step.name, step.item])).toEqual([
      [1, 'Home', `${ORIGIN}/`],
      [2, STARTER_PAGES.organisations?.title, `${ORIGIN}/organisations`],
      [3, 'Fake service', `${ORIGIN}/organisations/fake-service`],
    ])
  })

  it('names the home page once, as its first step, for a page under home/', () => {
    const steps = one(
      read({ path: '/home/x', title: 'X', trail: [{ path: '/', title: 'Home page' }] })['@graph'],
      'BreadcrumbList',
    ).itemListElement as Node[]
    expect(steps.map((step) => [step.position, step.name, step.item])).toEqual([
      [1, 'Home', `${ORIGIN}/`],
      [2, 'X', `${ORIGIN}/home/x`],
    ])
  })
})

describe('a page whose words are not finished', () => {
  const UNFINISHED: PageGraphInput = {
    path: '/fake-parent/fake-page',
    title: '[[TODO: the title, I-41]]',
    description: 'Fake [[TODO: the description, I-41]]',
    trail: [{ path: '/fake-parent', title: '[[TODO: the parent’s title, I-41]]' }],
  }

  it('shows no placeholder: the name falls back to the site’s, the description is left out', () => {
    const graph = read(UNFINISHED)['@graph']
    for (const text of strings(graph)) expect(text, text).not.toMatch(/\[\[|\]\]|TODO/)
    const page = one(graph, 'WebPage')
    expect(page.name).toBe(SITE_NAME)
    expect('description' in page).toBe(false)
  })

  it('keeps the page as the last step of its breadcrumb, and skips the page above it', () => {
    const steps = one(read(UNFINISHED)['@graph'], 'BreadcrumbList').itemListElement as Node[]
    expect(steps.map((step) => [step.position, step.name, step.item])).toEqual([
      [1, 'Home', `${ORIGIN}/`],
      [2, SITE_NAME, `${ORIGIN}/fake-parent/fake-page`],
    ])
  })

  it('leaves out an empty description rather than writing an empty string', () => {
    for (const description of ['', '   ', null, undefined]) {
      const page = one(
        read({ path: '/fake', title: 'Fake title', description })['@graph'],
        'WebPage',
      )
      expect('description' in page, String(description)).toBe(false)
    }
  })
})

describe('the origin', () => {
  it('is the platform domain unless the deployment names its own', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')
    const production = JSON.parse(serializeJsonLd(pageGraph(starter('about')))) as Graph
    expect(one(production['@graph'], 'AboutPage').url).toBe('https://imagecatalysts.in/about')
    expect(one(production['@graph'], 'LocalBusiness')['@id']).toBe(
      'https://imagecatalysts.in/#organization',
    )
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000')
    const local = JSON.parse(serializeJsonLd(pageGraph(starter('home')))) as Graph
    expect(one(local['@graph'], 'WebPage').url).toBe('http://localhost:3000/')
  })
})

describe('serializeJsonLd', () => {
  it('escapes every "<", so that no value can end the script element', () => {
    const hostile = 'Fake </script><script>alert(1)</script> & <!-- title'
    const text = serializeJsonLd(pageGraph({ path: '/fake', title: hostile }, ORIGIN))
    expect(text).not.toContain('<')
    expect(text).toContain('\\u003c/script>')
    const parsed = JSON.parse(text) as Graph
    expect(one(parsed['@graph'], 'WebPage').name).toBe(hostile)
  })
})
