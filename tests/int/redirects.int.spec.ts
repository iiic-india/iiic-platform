import { type PostgresAdapter, sql } from '@payloadcms/db-postgres'
import { createLocalReq, getPayload, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createRedirectFromMissingPage } from '@/lib/redirects/createFromMissing'
import { MISSING_PAGES_CAP } from '@/lib/redirects/missingPages'
import { purgeCutoff, purgeMissingPages, recordMissingPage } from '@/lib/redirects/store'
import { readRedirects } from '@/lib/redirects/table'
import type { Page, User } from '@/payload-types'
import config from '@/payload.config'

// The redirects and the 404 log against the real database (docs/04 `redirects`,
// `missing_pages`; docs/05, Content; docs/12 §3): who may do what, the checks a redirect passes,
// the redirect a moved page leaves behind, and what the 404 page writes. Obviously fake
// accounts, addresses and pages, each starting with a prefix that the cleanup deletes by.
let payload: Payload
const email = (label: string) => `int.redirects.${label}@example.invalid`
const ROLES = ['owner', 'operator', 'editor', 'practitioner'] as const
const PASSWORD = 'test-only-password-redirects'
const staff = {} as Record<(typeof ROLES)[number], User>
/** A staff user as Payload sees them after they entered their two-factor code. */
const verified = (user: User) => ({ ...user, _strategy: 'totp' }) as User

/** Every address and page here starts with these, so the cleanup never touches anything else. */
const FROM = '/int-redirects-'
const SLUG = 'int-redirects-'
const MISSING = '/int-404-'

const db = () => (payload.db as unknown as PostgresAdapter).drizzle

async function removeTestData() {
  await payload.delete({ collection: 'redirects', where: { from: { like: FROM } } })
  await payload.delete({ collection: 'redirects', where: { from: { like: MISSING } } })
  await payload.delete({ collection: 'pages', where: { slug: { like: SLUG } } })
  await db().execute(sql`DELETE FROM "missing_pages" WHERE "path" LIKE ${`${MISSING}%`}`)
  await payload.delete({ collection: 'users', where: { email: { like: 'int.redirects.' } } })
}

const hero = {
  blockType: 'hero' as const,
  heading: 'Fake heading',
  copyStatus: 'approved' as const,
}

/** A page published at once at an address of this file's own. */
function publishPage(slug: string): Promise<Page> {
  return payload.create({
    collection: 'pages',
    data: { title: 'Fake page', slug: `${SLUG}${slug}`, layout: [hero], _status: 'published' },
  })
}

/** A redirect to an address, as staff make one in the admin. */
function redirectTo(from: string, url: string, user?: User) {
  return payload.create({
    collection: 'redirects',
    data: { from, to: { type: 'custom', url }, type: '308' },
    ...(user ? { user, overrideAccess: false } : {}),
  })
}

/** The fields a refused save names, each with its message (Payload's ValidationError). */
function refusedFields(error: unknown): string[] {
  const errors = (error as { data?: { errors?: { path: string }[] } } | null)?.data?.errors ?? []
  return errors.map(({ path }) => path)
}

async function redirectFrom(from: string) {
  const { docs } = await payload.find({
    collection: 'redirects',
    where: { from: { equals: from } },
    depth: 0,
  })
  return docs[0]
}

beforeAll(async () => {
  payload = await getPayload({ config })
  await removeTestData()
  // The owner first: on an empty table the first account becomes the owner anyway.
  for (const role of ROLES) {
    staff[role] = await payload.create({
      collection: 'users',
      data: { name: `Fake ${role}`, email: email(role), password: PASSWORD, roles: [role] },
    })
  }
})

afterAll(async () => {
  await removeTestData()
})

describe('redirects', () => {
  it('are made, changed and removed by the staff who edit content, and read by no one else', async () => {
    const made = await redirectTo(`${FROM}by-editor`, '/about', verified(staff.editor))
    await expect(
      redirectTo(`${FROM}by-practitioner`, '/about', verified(staff.practitioner)),
    ).rejects.toThrow()
    // A password alone opens nothing (payload-totp wraps the plugin's collection too).
    await expect(redirectTo(`${FROM}no-code`, '/about', staff.editor)).rejects.toThrow()
    // Visitors never read them through the API; the site reads them on the server.
    await expect(payload.find({ collection: 'redirects', overrideAccess: false })).rejects.toThrow()
    await expect(
      payload.find({
        collection: 'redirects',
        user: verified(staff.practitioner),
        overrideAccess: false,
      }),
    ).rejects.toThrow()

    const changed = await payload.update({
      collection: 'redirects',
      id: made.id,
      data: { to: { type: 'custom', url: '/framework' } },
      user: verified(staff.operator),
      overrideAccess: false,
    })
    expect(changed.to?.url).toBe('/framework')
    await expect(
      payload.delete({
        collection: 'redirects',
        id: made.id,
        user: verified(staff.operator),
        overrideAccess: false,
      }),
    ).rejects.toThrow()
    await payload.delete({
      collection: 'redirects',
      id: made.id,
      user: verified(staff.editor),
      overrideAccess: false,
    })

    // Each change is in the audit log, with who made it (docs/08 §9).
    const audit = await payload.find({
      collection: 'audit-log',
      where: {
        and: [{ entity: { equals: 'redirects' } }, { entityId: { equals: String(made.id) } }],
      },
      // In the order they were written.
      sort: 'id',
    })
    expect(audit.docs.map(({ action, actorId }) => [action, actorId])).toEqual([
      ['create', String(staff.editor.id)],
      ['update', String(staff.operator.id)],
      ['delete', String(staff.editor.id)],
    ])
  })

  it('keep an old address in one form, and send visitors only to this site', async () => {
    const tidy = await redirectTo(` int-redirects-tidy/ `, ' about#contact ')
    expect(tidy.from).toBe(`${FROM}tidy`)
    expect(tidy.to?.url).toBe('/about#contact')
    for (const url of ['https://evil.example', '//evil.example', '/About']) {
      const refused = await redirectTo(`${FROM}elsewhere`, url).catch((error: unknown) => error)
      expect(refusedFields(refused), url).toEqual(['to.url'])
    }
    for (const from of ['/admin', '/api/health', '/']) {
      const refused = await redirectTo(from, '/about').catch((error: unknown) => error)
      expect(refusedFields(refused), from).toEqual(['from'])
    }
  })

  it('never chain and never loop', async () => {
    await redirectTo(`${FROM}a`, `${FROM}target`)
    // Onward: to an address that redirects again.
    const onward = await redirectTo(`${FROM}b`, `${FROM}a`).catch((error: unknown) => error)
    expect(refusedFields(onward)).toEqual(['to.url'])
    // Inward: from the address another redirect leads to.
    const inward = await redirectTo(`${FROM}target`, '/framework').catch((error: unknown) => error)
    expect(refusedFields(inward)).toEqual(['from'])
    // Back to itself.
    const loop = await redirectTo(`${FROM}self`, `${FROM}self#top`).catch((error: unknown) => error)
    expect(refusedFields(loop)).toEqual(['to.url'])
    // A second redirect from the same address.
    const twice = await redirectTo(`${FROM}a`, '/framework').catch((error: unknown) => error)
    expect(refusedFields(twice)).toContain('from')
  })

  it('cannot start where a page is published: the page wins', async () => {
    const page = await publishPage('live')
    const refused = await redirectTo(`/${page.slug}`, '/about').catch((error: unknown) => error)
    expect(refusedFields(refused)).toEqual(['from'])
  })
})

describe('a published page that gets a new address', () => {
  it('leaves a redirect from its old one to the page itself, which follows it through later moves', async () => {
    const page = await publishPage('moving')
    const move = (slug: string, extra: { draft?: boolean } = {}) =>
      payload.update({
        collection: 'pages',
        id: page.id,
        data: { slug: `${SLUG}${slug}`, ...(extra.draft ? {} : { _status: 'published' as const }) },
        ...extra,
        user: verified(staff.editor),
        overrideAccess: false,
      })

    // A draft at a new address changes nothing until it is published.
    await move('drafted', { draft: true })
    expect(await redirectFrom(`${FROM}moving`)).toBeUndefined()

    await move('moved')
    const first = await redirectFrom(`${FROM}moving`)
    expect(first?.to?.type).toBe('reference')
    expect(first?.to?.reference?.value).toBe(page.id)
    expect(first?.type).toBe('308')

    // An address-only redirect that named the old address is re-pointed, keeping its section.
    await redirectTo(`${FROM}to-moved`, `${FROM}moved#section`)
    await move('moved-again')
    expect((await redirectFrom(`${FROM}to-moved`))?.to?.url).toBe(`${FROM}moved-again#section`)
    const rules = (await readRedirects(payload)).filter(({ from }) => from.startsWith(FROM))
    expect(rules.find(({ from }) => from === `${FROM}moving`)?.to).toBe(`${FROM}moved-again`)
    expect(rules.find(({ from }) => from === `${FROM}moved`)?.to).toBe(`${FROM}moved-again`)

    // Back to its first address: the redirect from there goes, so nothing loops.
    await move('moving')
    expect(await redirectFrom(`${FROM}moving`)).toBeUndefined()
    const after = (await readRedirects(payload)).filter(({ from }) => from.startsWith(FROM))
    for (const rule of after.filter(({ pageId }) => pageId === page.id)) {
      expect(rule.to, rule.from).toBe(`${FROM}moving`)
    }
    expect(after.map(({ from }) => from)).toContain(`${FROM}moved-again`)
  })

  it('removes a redirect someone made from its address while it was elsewhere', async () => {
    const page = await publishPage('returning')
    await payload.update({
      collection: 'pages',
      id: page.id,
      data: { _status: 'draft' },
    })
    await redirectTo(`${FROM}returning`, '/about')
    await payload.update({ collection: 'pages', id: page.id, data: { _status: 'published' } })
    expect(await redirectFrom(`${FROM}returning`)).toBeUndefined()
  })
})

describe('the 404 log', () => {
  const entry = async (path: string) => {
    const { docs } = await payload.find({
      collection: 'missing-pages',
      where: { path: { equals: path } },
      depth: 0,
    })
    return docs[0]
  }

  it('adds an address once and counts each later visit, keeping the latest referring host', async () => {
    const path = `${MISSING}counted`
    await recordMissingPage(payload, { path, referrerHost: 'fake-partner.example' })
    await recordMissingPage(payload, { path, referrerHost: null })
    await recordMissingPage(payload, { path, referrerHost: 'other.example' })
    const logged = await entry(path)
    expect(logged?.hits).toBe(3)
    expect(logged?.referrerHost).toBe('other.example')
    expect(new Date(logged?.lastSeen ?? 0).getTime()).toBeGreaterThanOrEqual(
      new Date(logged?.firstSeen ?? 0).getTime(),
    )
  })

  it('holds no more addresses than its cap, while still counting visits to those it holds', async () => {
    const held = `${MISSING}held`
    await recordMissingPage(payload, { path: held, referrerHost: null })
    const { rows } = await db().execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM "missing_pages"`,
    )
    const room = MISSING_PAGES_CAP - Number(rows[0]?.n ?? 0)
    await db().execute(sql`
      INSERT INTO "missing_pages" ("path", "first_seen", "last_seen", "hits")
      SELECT ${`${MISSING}filler-`}::text || g::text, now(), now(), 1
      FROM generate_series(1, ${room}::int) AS g
    `)
    await recordMissingPage(payload, { path: `${MISSING}one-too-many`, referrerHost: null })
    expect(await entry(`${MISSING}one-too-many`)).toBeUndefined()
    await recordMissingPage(payload, { path: held, referrerHost: null })
    expect((await entry(held))?.hits).toBe(2)
    await db().execute(sql`DELETE FROM "missing_pages" WHERE "path" LIKE ${`${MISSING}filler-%`}`)
  })

  it('forgets an address nobody has asked for in 180 days, through its job (O5)', async () => {
    const stale = `${MISSING}stale`
    const fresh = `${MISSING}fresh`
    await recordMissingPage(payload, { path: stale, referrerHost: null })
    await recordMissingPage(payload, { path: fresh, referrerHost: null })
    await db().execute(
      sql`UPDATE "missing_pages" SET "last_seen" = now() - interval '181 days' WHERE "path" = ${stale}`,
    )
    await payload.jobs.queue({ task: 'O5-purge-missing-pages', input: {} })
    await payload.jobs.run()
    expect(await entry(stale)).toBeUndefined()
    expect(await entry(fresh)).toBeDefined()
    // Run again, it finds nothing more to remove.
    expect(await purgeMissingPages(payload, purgeCutoff())).toBe(0)
  })

  it('is read by the staff who edit content, written only by the site, and resolved by staff', async () => {
    const path = `${MISSING}access`
    await recordMissingPage(payload, { path, referrerHost: null })
    const logged = await entry(path)
    const as = (role: (typeof ROLES)[number]) => ({
      user: verified(staff[role]),
      overrideAccess: false,
      depth: 0,
    })
    expect(
      (await payload.find({ collection: 'missing-pages', ...as('editor') })).totalDocs,
    ).toBeGreaterThan(0)
    await expect(
      payload.find({ collection: 'missing-pages', ...as('practitioner') }),
    ).rejects.toThrow()
    await expect(
      payload.find({ collection: 'missing-pages', overrideAccess: false }),
    ).rejects.toThrow()
    await expect(
      payload.create({
        collection: 'missing-pages',
        data: {
          path: `${MISSING}by-hand`,
          hits: 1,
          firstSeen: '2026-11-22T00:00:00.000Z',
          firstSeen_tz: 'Asia/Kolkata',
          lastSeen: '2026-11-22T00:00:00.000Z',
          lastSeen_tz: 'Asia/Kolkata',
        },
        ...as('owner'),
      }),
    ).rejects.toThrow()

    // What the 404 page wrote stays as it was; only the redirect is set by staff.
    const redirect = await redirectTo(`${FROM}for-log`, '/about')
    const updated = await payload.update({
      collection: 'missing-pages',
      id: logged!.id,
      data: { hits: 999, path: '/changed', resolved: redirect.id },
      ...as('operator'),
    })
    expect(updated.hits).toBe(1)
    expect(updated.path).toBe(path)
    expect(updated.resolved).toBe(redirect.id)
    await expect(
      payload.delete({ collection: 'missing-pages', id: logged!.id, ...as('operator') }),
    ).rejects.toThrow()
    await payload.delete({ collection: 'missing-pages', id: logged!.id, ...as('editor') })
  })

  it('turns an address into a redirect in one step, and marks it resolved', async () => {
    const path = `${MISSING}create-redirect`
    await recordMissingPage(payload, { path, referrerHost: null })
    const logged = await entry(path)
    const call = async (body: Record<string, unknown>) => {
      const req = await createLocalReq(
        { user: { ...staff.editor, collection: 'users', _strategy: 'totp' } as never },
        payload,
      )
      req.json = async () => body
      req.routeParams = { id: logged!.id }
      return createRedirectFromMissingPage(req)
    }

    // A refusal leaves the entry as it was.
    const refused = await call({ to: 'https://evil.example' })
    expect(refused.status).toBe(400)
    expect((await entry(path))?.resolved).toBeFalsy()

    const made = await call({ to: '/about' })
    expect(made.status).toBe(201)
    const redirect = await redirectFrom(path)
    expect(redirect?.to?.url).toBe('/about')
    expect((await entry(path))?.resolved).toBe(redirect?.id)

    expect((await call({ to: '/framework' })).status).toBe(409)
    await payload.delete({ collection: 'redirects', id: redirect!.id })
  })
})
