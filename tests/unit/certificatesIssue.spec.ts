// @vitest-environment node
import type { Payload, PayloadRequest } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CertificateStore } from '@/lib/certificates/contract'
import type { CertificateEvent } from '@/lib/certificates/events'
import { formatCertificateId, parseCertificateId } from '@/lib/certificates/ids'
import { type CertificateDeps, makeCertificateActions } from '@/lib/certificates/issue'
import { memoryStore, pdfKeyFor } from '@/lib/certificates/store'
import { readCertificateTemplate } from '@/lib/certificates/template'
import { hashVerifyToken, newVerifyToken, sha256Hex, VERIFY_PATH } from '@/lib/certificates/token'
import { makeVerify } from '@/lib/certificates/verify'
import { err, ok } from '@/lib/result'

import { decodeSvg, qrSvgIn } from '../helpers/certificateQr'

vi.mock('server-only', () => ({}))

// Issuing, revoking, reissuing and downloading certificates (docs/18 §4; D-39), against a small
// in-memory Payload with transactions and unique IDs: every act refuses anonymous, code-less,
// deactivated and wrong-role requests before it reads its input; an issue numbers from the
// year's highest, stores only the token's hash, keeps each PDF with its SHA-256, audits each
// certificate under its own name and raises C5's event with the id only; a failure anywhere
// issues nothing; the QR code on the page decodes to a link the verify page answers Valid, then
// Revoked; a reissue's old page names the new ID. Every name is obviously fake.

type Row = Record<string, unknown> & { id: number }
type Where = Record<string, unknown>

const SITE = 'https://example.invalid'
const NOW = new Date('2099-03-01T06:00:00.000Z')
const OFFICE = ['owner', 'operator']

function matches(row: Row, where: Where | undefined): boolean {
  if (!where) return true
  if (Array.isArray(where.and)) return (where.and as Where[]).every((part) => matches(row, part))
  return Object.entries(where).every(([field, condition]) => {
    const value = row[field]
    const test = condition as { equals?: unknown; like?: unknown; in?: unknown[] }
    if ('equals' in test) return value === test.equals
    if ('like' in test) {
      return (
        typeof value === 'string' && value.toLowerCase().includes(String(test.like).toLowerCase())
      )
    }
    if ('in' in test) return (test.in ?? []).includes(value)
    return false
  })
}

const UNIQUE = ['certificateId', 'verifyTokenHash', 'replaces'] as const

/** A Payload of a few collections in memory, with transactions that roll back. */
function fakePayload(options: { signatory?: boolean } = {}) {
  let tables: Record<string, Row[]> = {
    certificates: [],
    'audit-log': [],
    people: [
      { id: 11, fullName: 'Example Learner' },
      { id: 12, fullName: 'Example Second Learner' },
    ],
  }
  let saved: string | null = null
  let nextId = 100
  /** Each certificates write with the audit action it ran under. */
  const writes: { op: 'create' | 'update'; action: unknown; id: number }[] = []
  /** Calls a refused request must never make. */
  const calls: string[] = []
  /** Rows a find of certificates by `like` leaves out once: another issue's, not seen yet. */
  let hiddenOnce: string | null = null

  const readable = (req: PayloadRequest | undefined, overrideAccess: unknown) => {
    if (overrideAccess !== false) return true
    const roles = (req?.user as { roles?: string[] } | null)?.roles ?? []
    return roles.some((role) => OFFICE.includes(role))
  }

  const payload = {
    db: {
      beginTransaction: async () => {
        saved = JSON.stringify(tables)
        return 'tx-fake'
      },
      commitTransaction: async () => {
        saved = null
      },
      rollbackTransaction: async () => {
        if (saved) tables = JSON.parse(saved) as typeof tables
        saved = null
      },
    },
    findGlobal: async () => {
      calls.push('findGlobal')
      return {
        certificates: options.signatory
          ? { signatoryName: 'Example Signatory', signatoryTitle: 'Example Title (fake)' }
          : {},
      }
    },
    find: async (args: {
      collection: string
      where?: Where
      overrideAccess?: boolean
      req?: PayloadRequest
      limit?: number
    }) => {
      calls.push(`find:${args.collection}`)
      if (!readable(args.req, args.overrideAccess)) return { docs: [] }
      let docs = (tables[args.collection] ?? []).filter((row) => matches(row, args.where))
      if (hiddenOnce && 'certificateId' in (args.where ?? {})) {
        const hidden = hiddenOnce
        hiddenOnce = null
        docs = docs.filter((row) => row.certificateId !== hidden)
      }
      return { docs: structuredClone(args.limit ? docs.slice(0, args.limit) : docs) }
    },
    findByID: async (args: {
      collection: string
      id: number
      overrideAccess?: boolean
      req?: PayloadRequest
    }) => {
      calls.push(`findByID:${args.collection}`)
      if (!readable(args.req, args.overrideAccess)) return null
      const row = (tables[args.collection] ?? []).find(({ id }) => id === args.id)
      return row ? structuredClone(row) : null
    },
    create: async (args: {
      collection: string
      data: Record<string, unknown>
      req?: PayloadRequest
    }) => {
      calls.push(`create:${args.collection}`)
      const table = (tables[args.collection] ??= [])
      if (args.collection === 'certificates') {
        for (const field of UNIQUE) {
          const value = args.data[field]
          if (value !== undefined && table.some((row) => row[field] === value)) {
            throw new Error(
              `duplicate key value violates unique constraint "certificates_${field === 'certificateId' ? 'certificate_id' : field}_idx"`,
            )
          }
        }
      }
      const row = { ...structuredClone(args.data), id: (nextId += 1) } as Row
      table.push(row)
      if (args.collection === 'certificates') {
        writes.push({ op: 'create', action: args.req?.context.auditAction, id: row.id })
      }
      return structuredClone(row)
    },
    update: async (args: {
      collection: string
      id?: number
      where?: Where
      data: Record<string, unknown>
      req?: PayloadRequest
    }) => {
      calls.push(`update:${args.collection}`)
      const table = tables[args.collection] ?? []
      const targets = table.filter((row) =>
        args.id === undefined ? matches(row, args.where) : row.id === args.id,
      )
      for (const row of targets) {
        Object.assign(row, structuredClone(args.data))
        writes.push({ op: 'update', action: args.req?.context.auditAction, id: row.id })
      }
      return args.id === undefined
        ? { docs: structuredClone(targets) }
        : structuredClone(targets[0])
    },
  }

  return {
    payload: payload as unknown as Payload,
    rows: (collection: string) => tables[collection] ?? [],
    writes,
    calls,
    hideOnce: (certificateId: string) => {
      hiddenOnce = certificateId
    },
    insert: (collection: string, row: Row) => (tables[collection] ??= []).push(row),
  }
}

type Fake = ReturnType<typeof fakePayload>

const staff = (roles: string[], over: Record<string, unknown> = {}) => ({
  id: roles.length ? 7 : 8,
  collection: 'users',
  _strategy: 'totp',
  roles,
  email: 'staff.test@example.invalid',
  ...over,
})

const requestOf = (fake: Fake, user: unknown): PayloadRequest =>
  ({
    payload: fake.payload,
    user,
    context: {},
    headers: new Headers(),
  }) as unknown as PayloadRequest

let fake: Fake
let store: CertificateStore & { keys(): string[] }
let pages: string[]
let events: CertificateEvent[]
let tokens: string[]

function depsOf(over: Partial<CertificateDeps> = {}): CertificateDeps {
  return {
    store: () => ok(store),
    render: async (html) => {
      pages.push(html)
      return new TextEncoder().encode(`%PDF-1.7 fake page ${pages.length}`)
    },
    selfContain: async (html) => html,
    template: readCertificateTemplate,
    siteUrl: () => SITE,
    now: () => NOW,
    newToken: () => {
      const token = newVerifyToken(new Uint8Array(16).fill(tokens.length + 1))
      tokens.push(token)
      return token
    },
    newBatch: () => 'batch-fake',
    emit: async (_req, event) => {
      events.push(event)
    },
    ...over,
  }
}

const programme = {
  programmeName: 'Example Programme (fake)',
  programmeDetails: 'Example batch (fake)',
  completedOn: '2099-02-20',
}

const one = { ...programme, recipients: [{ personId: 11, nameAsPrinted: 'Example Learner' }] }
const two = {
  ...programme,
  recipients: [
    { personId: 11, nameAsPrinted: 'Example Learner' },
    { personId: 12, nameAsPrinted: 'Example Second Learner' },
  ],
}

beforeEach(() => {
  fake = fakePayload({ signatory: true })
  store = memoryStore()
  pages = []
  events = []
  tokens = []
})

const owner = () => requestOf(fake, staff(['owner']))
const operator = () => requestOf(fake, staff(['operator']))

describe('every act refuses before it reads its input (CLAUDE.md #6)', () => {
  const refusals: [string, unknown, number, string][] = [
    ['no one signed in', null, 401, 'sign-in'],
    ['a customer session', { id: 1, collection: 'people', _strategy: 'totp' }, 401, 'sign-in'],
    ['staff without the code', staff(['owner'], { _strategy: 'local-jwt' }), 403, 'enter-code'],
    ['a deactivated owner', staff(['owner'], { active: false }), 403, 'not-allowed'],
    ['an editor', staff(['editor']), 403, 'not-allowed'],
    ['finance', staff(['finance']), 403, 'not-allowed'],
    ['a practitioner', staff(['practitioner']), 403, 'not-allowed'],
  ]

  it.each(refusals)(
    'refuses %s everything, with nothing read',
    async (_who, user, status, code) => {
      const actions = makeCertificateActions(depsOf())
      const req = requestOf(fake, user)
      const answers = await Promise.all([
        actions.preview(req, one),
        actions.issue(req, one),
        actions.revoke(req, { certificateId: 1, reason: 'Example reason (fake)' }),
        actions.reissue(req, { certificateId: 1, reason: 'Example reason (fake)' }),
        actions.download(req, 1),
        // Malformed input is refused the same way: the role is asked first.
        actions.issue(req, { nonsense: true }),
      ])
      for (const answer of answers) {
        expect(answer).toEqual(err({ code: 'refused', refusal: { status, code } }))
      }
      expect(fake.calls).toEqual([])
    },
  )

  it('lets the operator issue and download, but only an owner revoke or reissue', async () => {
    const actions = makeCertificateActions(depsOf())
    const issued = await actions.issue(operator(), one)
    expect(issued.ok).toBe(true)
    const id = issued.ok ? (issued.value[0]?.id as number) : 0
    expect((await actions.download(operator(), id)).ok).toBe(true)
    const refusal = err({ code: 'refused', refusal: { status: 403, code: 'not-allowed' } })
    expect(
      await actions.revoke(operator(), { certificateId: id, reason: 'Example reason' }),
    ).toEqual(refusal)
    expect(
      await actions.reissue(operator(), { certificateId: id, reason: 'Example reason' }),
    ).toEqual(refusal)
  })
})

describe('issuing', () => {
  it('numbers from the year’s highest, with the check digit, and keeps only the token’s hash', async () => {
    fake.insert('certificates', {
      id: 1,
      certificateId: formatCertificateId(2099, 41),
      status: 'valid',
    })
    const actions = makeCertificateActions(depsOf())
    const issued = await actions.issue(operator(), two)
    expect(issued.ok).toBe(true)
    const ids = issued.ok ? issued.value.map(({ certificateId }) => certificateId) : []
    expect(ids).toEqual([formatCertificateId(2099, 42), formatCertificateId(2099, 43)])
    for (const id of ids) expect(parseCertificateId(id)).not.toBeNull()

    const rows = fake.rows('certificates').slice(1)
    expect(rows.map((row) => row.verifyTokenHash)).toEqual(tokens.map(hashVerifyToken))
    // The token itself is in no row: only the PDF and its QR code carry it.
    for (const token of tokens)
      expect(JSON.stringify(fake.rows('certificates'))).not.toContain(token)
    expect(rows.every((row) => row.status === 'valid' && row.batch === 'batch-fake')).toBe(true)
    expect(rows.map((row) => row.issuedBy)).toEqual([7, 7])
  })

  it('keeps each PDF under its key with its SHA-256, audits each, and raises C5 with the id only', async () => {
    const actions = makeCertificateActions(depsOf())
    const issued = await actions.issue(operator(), two)
    expect(issued.ok).toBe(true)
    const rows = fake.rows('certificates')
    for (const row of rows) {
      const key = pdfKeyFor(row.certificateId as string)
      expect(row.pdfKey).toBe(key)
      const pdf = await store.get(key)
      expect(pdf).not.toBeNull()
      expect(row.pdfSha256).toBe(sha256Hex(pdf as Uint8Array))
    }
    expect(fake.writes).toEqual(
      rows.map((row) => ({ op: 'create', action: 'issue-certificate', id: row.id })),
    )
    expect(events).toEqual(
      rows.map((row) => ({ name: 'certificate.issued', certificateId: row.id })),
    )
  })

  it('prints the fixed statement, the signatory and the escaped name, and no word of a degree', async () => {
    const actions = makeCertificateActions(depsOf())
    await actions.issue(operator(), {
      ...programme,
      recipients: [{ personId: 11, nameAsPrinted: 'Example <b>Learner</b>' }],
    })
    const [page] = pages
    expect(page).toContain('Certificate of Completion.')
    expect(page).toContain('Example Signatory')
    expect(page).toContain('Example &lt;b&gt;Learner&lt;/b&gt;')
    expect(page).not.toContain('<b>Learner')
    expect(page).not.toContain('iiic-todo')
  })

  it('refuses without the signatory, the store or the renderer, and issues nothing', async () => {
    fake = fakePayload({ signatory: false })
    expect(await makeCertificateActions(depsOf()).issue(operator(), one)).toEqual(
      err({ code: 'signatory-missing' }),
    )
    fake = fakePayload({ signatory: true })
    const noStore = depsOf({ store: () => err({ code: 'storage-missing' }) })
    expect(await makeCertificateActions(noStore).issue(operator(), one)).toEqual(
      err({ code: 'storage-missing' }),
    )
    expect(await makeCertificateActions(depsOf({ render: null })).issue(operator(), one)).toEqual(
      err({ code: 'render-failed' }),
    )
    expect(fake.rows('certificates')).toEqual([])
    expect(store.keys()).toEqual([])
  })

  it('issues nothing when one PDF of the batch cannot be made', async () => {
    let made = 0
    const failing = depsOf({
      render: async () => {
        made += 1
        if (made === 2) throw new Error('fake renderer failure')
        return new TextEncoder().encode('%PDF-1.7 fake')
      },
    })
    expect(await makeCertificateActions(failing).issue(operator(), two)).toEqual(
      err({ code: 'render-failed' }),
    )
    expect(fake.rows('certificates')).toEqual([])
    expect(events).toEqual([])
    expect(store.keys()).toEqual([])
  })

  it('rolls the whole batch back when a PDF cannot be stored', async () => {
    const broken: CertificateStore = {
      put: async () => {
        throw new Error('fake bucket failure')
      },
      get: async () => null,
    }
    const actions = makeCertificateActions(depsOf({ store: () => ok(broken) }))
    await expect(actions.issue(operator(), two)).rejects.toThrow('fake bucket failure')
    expect(fake.rows('certificates')).toEqual([])
    expect(fake.rows('audit-log')).toEqual([])
  })

  it('starts again from the new highest when another issue took the number first', async () => {
    const taken = formatCertificateId(2099, 1)
    fake.insert('certificates', { id: 1, certificateId: taken, status: 'valid' })
    fake.hideOnce(taken)
    const issued = await makeCertificateActions(depsOf()).issue(operator(), one)
    expect(issued.ok && issued.value.map(({ certificateId }) => certificateId)).toEqual([
      formatCertificateId(2099, 2),
    ])
  })

  it('refuses a person listed twice, and people no longer on record', async () => {
    const actions = makeCertificateActions(depsOf())
    const twice = { ...programme, recipients: [one.recipients[0], one.recipients[0]] }
    expect((await actions.issue(operator(), twice)).ok).toBe(false)
    const gone = { ...programme, recipients: [{ personId: 99, nameAsPrinted: 'Example Gone' }] }
    expect(await actions.issue(operator(), gone)).toEqual(
      err({ code: 'person-not-found', personIds: [99] }),
    )
    expect(fake.rows('certificates')).toEqual([])
  })

  it('previews without storing anything, the ID and link marked as a preview', async () => {
    fake = fakePayload({ signatory: false })
    const preview = await makeCertificateActions(depsOf()).preview(operator(), two)
    expect(preview.ok).toBe(true)
    const shown = preview.ok ? preview.value : []
    expect(shown).toHaveLength(2)
    expect(shown[0]?.html).toContain('Preview: the ID is given on issue')
    expect(shown[0]?.html).toContain('[[TODO: signatory')
    expect(shown[0]?.waitingFor).toEqual(['I-54', 'I-22'])
    expect(fake.rows('certificates')).toEqual([])
    expect(store.keys()).toEqual([])
    expect(tokens).toEqual([])
  })
})

describe('the QR code, the verify page, revoking and reissuing', () => {
  const verify = () => makeVerify(async () => fake.payload)

  it('decodes to a link whose page says Valid, then Revoked once revoked', async () => {
    const actions = makeCertificateActions(depsOf())
    const issued = await actions.issue(operator(), one)
    const id = issued.ok ? (issued.value[0]?.id as number) : 0

    const svg = qrSvgIn(pages[0] as string)
    expect(svg).not.toBeNull()
    const link = await decodeSvg(svg as string)
    expect(link).toBe(`${SITE}${VERIFY_PATH}/${tokens[0]}`)
    const token = (link as string).split('/').pop() as string

    const valid = await verify().verifyByToken(token)
    expect(valid).toMatchObject({ found: true, status: 'valid', name: 'Example Learner' })

    expect(
      await actions.revoke(owner(), { certificateId: id, reason: 'Example reason (fake)' }),
    ).toEqual(ok({ id }))
    const revoked = await verify().verifyByToken(token)
    expect(revoked).toMatchObject({ found: true, status: 'revoked', revokedOn: '2099-03-01' })
    // The reason stays in the admin.
    expect(JSON.stringify(revoked)).not.toContain('Example reason')
    expect(fake.writes.at(-1)).toEqual({ op: 'update', action: 'revoke-certificate', id })

    expect(
      await actions.revoke(owner(), { certificateId: id, reason: 'Example reason (fake)' }),
    ).toEqual(err({ code: 'already-revoked' }))
    expect(
      await actions.revoke(owner(), { certificateId: 9999, reason: 'Example reason (fake)' }),
    ).toEqual(err({ code: 'not-found' }))
  })

  it('reissues under a new ID that replaces the old, whose page then names it', async () => {
    const actions = makeCertificateActions(depsOf())
    const issued = await actions.issue(operator(), one)
    const old = issued.ok ? (issued.value[0] as { id: number; certificateId: string }) : null
    const reissued = await actions.reissue(owner(), {
      certificateId: old?.id,
      reason: 'Name misspelt (fake)',
      nameAsPrinted: 'Example Learner Corrected',
    })
    expect(reissued.ok).toBe(true)
    const fresh = reissued.ok ? reissued.value : null
    expect(fresh?.certificateId).toBe(formatCertificateId(2099, 2))

    const rows = fake.rows('certificates')
    expect(rows.find((row) => row.id === old?.id)?.status).toBe('revoked')
    const replacement = rows.find((row) => row.id === fresh?.id)
    expect(replacement).toMatchObject({
      replaces: old?.id,
      nameAsPrinted: 'Example Learner Corrected',
      programmeName: programme.programmeName,
      status: 'valid',
    })
    expect(fake.writes.slice(-2).map(({ action }) => action)).toEqual([
      'reissue-certificate',
      'reissue-certificate',
    ])

    const oldPage = await verify().verifyByToken(tokens[0] as string)
    expect(oldPage).toMatchObject({ status: 'revoked', replacedBy: fresh?.certificateId })
    const byId = await verify().verifyById((old?.certificateId as string).toLowerCase())
    expect(byId).toMatchObject({ status: 'revoked', replacedBy: fresh?.certificateId })

    expect(
      await actions.reissue(owner(), { certificateId: old?.id, reason: 'Again (fake)' }),
    ).toEqual(err({ code: 'already-revoked' }))
  })

  it('shows by a typed ID only what the design allows: initials, never the reason or a contact', async () => {
    const actions = makeCertificateActions(depsOf())
    const issued = await actions.issue(operator(), one)
    const certificateId = issued.ok ? (issued.value[0]?.certificateId as string) : ''
    const view = await verify().verifyById(` ${certificateId.toLowerCase()} `)
    expect(view).toEqual({
      found: true,
      certificateId,
      status: 'valid',
      name: 'E. L.',
      programmeName: programme.programmeName,
      programmeDetails: programme.programmeDetails,
      completedOn: programme.completedOn,
      issuedOn: '2099-03-01',
      revokedOn: null,
      replacedBy: null,
    })
    // A wrong check digit is never looked up.
    const calls = fake.calls.length
    const wrong = certificateId.replace(/\d$/, (digit) => String((Number(digit) + 1) % 10))
    expect(await verify().verifyById(wrong)).toEqual({ found: false })
    expect(fake.calls.length).toBe(calls)
  })
})

describe('downloading', () => {
  it('records download-certificate before the file is handed over', async () => {
    const actions = makeCertificateActions(depsOf())
    const issued = await actions.issue(operator(), one)
    const id = issued.ok ? (issued.value[0]?.id as number) : 0
    const file = await actions.download(operator(), String(id))
    expect(file.ok).toBe(true)
    expect(fake.rows('audit-log')).toEqual([
      expect.objectContaining({
        action: 'download-certificate',
        entity: 'certificates',
        entityId: String(id),
      }),
    ])
  })

  it('refuses a file that does not match the hash kept at issue, and an unknown id', async () => {
    const actions = makeCertificateActions(depsOf())
    const issued = await actions.issue(operator(), one)
    const id = issued.ok ? (issued.value[0]?.id as number) : 0
    const row = fake.rows('certificates')[0] as Row
    await store.put(row.pdfKey as string, new TextEncoder().encode('%PDF-1.7 tampered'))
    expect(await actions.download(operator(), id)).toEqual(err({ code: 'not-found' }))
    expect(await actions.download(operator(), 'not-a-number')).toEqual(err({ code: 'not-found' }))
    expect(fake.rows('audit-log')).toEqual([])
  })
})
