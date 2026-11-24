// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/notes/notes', () => ({ countNotesForOwner: vi.fn() }))
vi.mock('@/lib/privacy/stepUp', () => ({ enterCodeAgain: vi.fn() }))

const shared = await import('@/lib/adminViews/shared')
const { firstOpenClock } = await import('@/lib/adminViews/today')
const { readCalendarQuery } = await import('@/lib/adminViews/calendar')
const { bookingFigures, readPeriod, revenueBy } = await import('@/lib/adminViews/reports')
const { kindsFor, normaliseQuery } = await import('@/lib/adminViews/search')
const { consentsInForce, notShownFor } = await import('@/lib/adminViews/timeline')
const { auditCsv, auditWhere, csvCell, integrationStates, readAuditFilter } =
  await import('@/lib/adminViews/settings')
const { approvalRecorded, caseStudyProblems } = await import('@/lib/proof/caseStudies')

// The views' rules as pure functions (docs/18 §6, §7): India's days and weeks, the clocks Today
// shows first, what search matches, the figures' arithmetic, the consents in force, the audit
// CSV and the case study's publish rule. Every person, number and key here is obviously fake.

const staff = (roles: string[]) => ({ id: 1, collection: 'users', roles, active: true })

describe('India days for the calendar and Reports', () => {
  it('starts a week on Monday, across a month and a year', () => {
    expect(shared.weekStart('2027-01-06')).toBe('2027-01-04')
    expect(shared.weekStart('2027-01-04')).toBe('2027-01-04')
    expect(shared.weekStart('2027-01-03')).toBe('2026-12-28')
    expect(shared.calendarDays('week', '2027-03-03')).toEqual([
      '2027-03-01',
      '2027-03-02',
      '2027-03-03',
      '2027-03-04',
      '2027-03-05',
      '2027-03-06',
      '2027-03-07',
    ])
    expect(shared.calendarDays('day', '2027-03-03')).toEqual(['2027-03-03'])
  })

  it('counts a day from midnight in India', () => {
    expect(shared.dayStart('2027-01-04').toISOString()).toBe('2027-01-03T18:30:00.000Z')
    expect(shared.periodRange('2027-01-01', '2027-01-31')).toEqual({
      gte: '2026-12-31T18:30:00.000Z',
      lt: '2027-01-31T18:30:00.000Z',
    })
    expect(shared.monthOf('2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
  })

  it('reads the calendar address with today as the default day', () => {
    expect(readCalendarQuery({}, '2027-01-04')).toEqual({
      view: undefined,
      day: '2027-01-04',
      practitionerId: undefined,
    })
    expect(readCalendarQuery({ view: 'day', day: ['2027-01-05'] }, '2027-01-04')).toMatchObject({
      view: 'day',
      day: '2027-01-05',
    })
  })

  it('takes this month as the report period, and refuses one backwards or over a year', () => {
    const now = new Date('2027-02-10T06:00:00Z')
    expect(readPeriod({}, now)).toEqual({
      ok: true,
      value: { from: '2027-02-01', to: '2027-02-28' },
    })
    expect(readPeriod({ from: '2027-02-05' }, now)).toEqual({
      ok: true,
      value: { from: '2027-02-05', to: '2027-02-05' },
    })
    expect(readPeriod({ from: '2027-03-01', to: '2027-02-01' }, now)).toMatchObject({ ok: false })
    expect(readPeriod({ from: '2026-01-01', to: '2027-02-01' }, now)).toMatchObject({ ok: false })
    expect(readPeriod({ from: 'last month' }, now)).toMatchObject({ ok: false })
  })
})

describe('a schedule line', () => {
  it('shows paid, unpaid or free, never an amount', () => {
    expect(shared.paidState('notRequired')).toBe('free')
    expect(shared.paidState('paid')).toBe('paid')
    expect(shared.paidState('partRefunded')).toBe('paid')
    expect(shared.paidState('linkSent')).toBe('unpaid')
    const line = shared.scheduleItem(
      {
        id: 3,
        reference: 'IIIC-S-00003',
        type: 'session',
        status: 'confirmed',
        paymentStatus: 'paid',
        startsAt: '2027-01-04T05:00:00.000Z',
        endsAt: '2027-01-04T06:00:00.000Z',
        person: { fullName: 'Fake Client' },
      },
      true,
    )
    expect(line).toMatchObject({ clientName: 'Fake Client', paid: 'paid', firstTime: true })
    expect(JSON.stringify(line)).not.toMatch(/paise|price|total/i)
  })

  it('takes the median of an even and an odd count', () => {
    expect(shared.median([])).toBeNull()
    expect(shared.median([5, 1, 3])).toBe(3)
    expect(shared.median([4, 1, 3, 2])).toBe(2.5)
  })
})

describe('Today’s privacy panel', () => {
  it('shows the earliest clock still running or late', () => {
    const now = new Date('2027-01-04T00:00:00Z')
    const soon = new Date('2027-01-04T03:00:00Z')
    const later = new Date('2027-01-05T00:00:00Z')
    expect(
      firstOpenClock([
        { state: 'done', at: now },
        { state: 'running', dueAt: later, hoursLeft: 24 },
        { state: 'running', dueAt: soon, hoursLeft: 3 },
      ]),
    ).toEqual({ dueAt: soon, hoursLeft: 3 })
    expect(firstOpenClock([{ state: 'overdue', dueAt: now, hoursLate: 2 }])).toEqual({
      dueAt: now,
      hoursLeft: -2,
    })
    expect(firstOpenClock([{ state: 'not-applicable' }])).toBeNull()
  })
})

describe('global search', () => {
  it('matches a phone in E.164 and an email in small letters', () => {
    expect(normaliseQuery(' 98123 45678 ')).toEqual({
      text: '98123 45678',
      phone: '+919812345678',
      email: null,
    })
    expect(normaliseQuery('Fake.Person@Example.Invalid').email).toBe('fake.person@example.invalid')
    expect(normaliseQuery('IIIC-S-00001').phone).toBeNull()
  })

  it('searches only the kinds a role reads, never notes', () => {
    expect(kindsFor(staff(['practitioner']))).toEqual(['booking'])
    expect(kindsFor(staff(['finance']))).toEqual(['invoice'])
    expect(kindsFor(staff(['operator']))).toEqual([
      'person',
      'booking',
      'certificate',
      'organisation',
      'lead',
    ])
    expect(kindsFor(staff(['owner']))).toHaveLength(6)
    expect(kindsFor(staff(['editor']))).toEqual([])
  })
})

describe('Reports’ arithmetic', () => {
  const range = shared.periodRange('2027-01-01', '2027-01-31')
  const row = (
    id: number,
    person: number,
    register: string,
    type: string,
    status: string,
    startsAt: string,
  ) => ({ id, person, register, type, status, startsAt })

  it('counts cross-path people, calls, sessions, returns and no-shows', () => {
    const rows = [
      row(1, 1, 'counselling', 'session', 'completed', '2026-12-10T05:00:00Z'),
      row(2, 1, 'counselling', 'session', 'completed', '2027-01-10T05:00:00Z'),
      row(3, 1, 'education', 'info', 'confirmed', '2027-01-12T05:00:00Z'),
      row(4, 2, 'counselling', 'session', 'noShow', '2027-01-15T05:00:00Z'),
      row(5, 3, 'consultancy', 'call', 'confirmed', '2027-01-20T05:00:00Z'),
      row(6, 4, 'consultancy', 'call', 'cancelledByClient', '2027-01-21T05:00:00Z'),
    ]
    const figures = bookingFigures(rows, range)
    expect(figures.crossPath).toEqual({ numerator: 1, denominator: 3 })
    expect(figures.calls).toBe(1)
    expect(figures.sessions).toBe(2)
    expect(figures.returning).toEqual({ numerator: 1, denominator: 2 })
    expect(figures.noShow).toEqual({ numerator: 1, denominator: 2 })
  })

  it('takes processed refunds off captured payments, by application, in paise', () => {
    expect(
      revenueBy(
        [
          { amountPaise: 150_000, register: 'counselling' },
          { amountPaise: 50_000, register: 'consultancy' },
        ],
        [{ amountPaise: 25_000, register: 'counselling' }],
      ),
    ).toEqual({
      total: 175_000,
      byRegister: { consultancy: 50_000, education: 0, counselling: 125_000 },
    })
  })
})

describe('the person record', () => {
  it('keeps the consents in force: given, and not withdrawn since', () => {
    expect(
      consentsInForce([
        { id: 1, purpose: 'marketingEmail', grantedAt: '2027-01-01T00:00:00Z' },
        { id: 2, purpose: 'bookingCommunications', grantedAt: '2027-01-02T00:00:00Z' },
        { id: 3, purpose: 'marketingEmail', grantedAt: '2027-01-01T00:00:00Z', withdraws: 1 },
      ]),
    ).toEqual([{ purpose: expect.any(String), since: '2027-01-02T00:00:00Z' }])
  })

  it('names what a practitioner does not see, and what waits on later milestones', () => {
    const practitioner = notShownFor(staff(['practitioner']))
    expect(practitioner.join(' ')).toMatch(/Bookings with other practitioners/)
    expect(practitioner.join(' ')).toMatch(/Payments/)
    expect(notShownFor(staff(['owner']))).toEqual([
      'Messages (waits on M6)',
      'Course enrolments (waits on Release 2)',
    ])
    expect(notShownFor(staff(['operator']))[0]).toMatch(/Invoices/)
  })
})

describe('Settings', () => {
  it('names each integration and whether it is configured, never a value', () => {
    const states = integrationStates({
      RAZORPAY_KEY_ID: 'rzp_test_fakefakefake',
      RAZORPAY_KEY_SECRET: 'fake-secret-value',
      RAZORPAY_WEBHOOK_SECRET: 'fake-webhook-secret-value',
      RESEND_API_KEY: undefined,
    })
    expect(states.find((state) => state.name.startsWith('Payments'))?.configured).toBe(true)
    expect(states.find((state) => state.name.startsWith('Email'))?.configured).toBe(false)
    expect(JSON.stringify(states)).not.toMatch(/fake/)
  })

  it('reads the audit filter, dropping anything malformed', () => {
    expect(readAuditFilter({ entity: 'people', action: 'read-note', from: 'yesterday' })).toEqual({
      entity: 'people',
      action: 'read-note',
      from: undefined,
      to: undefined,
    })
    expect(readAuditFilter({ entity: "people'; drop" }).entity).toBeUndefined()
    expect(auditWhere({})).toEqual({})
    expect(auditWhere({ from: '2027-01-01' })).toEqual({
      and: [
        { at: { greater_than_equal: '2026-12-31T18:30:00.000Z' } },
        { at: { less_than: '2027-01-01T18:30:00.000Z' } },
      ],
    })
  })

  it('writes a CSV a spreadsheet never runs as a formula', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"')
    expect(csvCell('+91 fake')).toBe('"\'+91 fake"')
    expect(csvCell('plain')).toBe('"plain"')
    const csv = auditCsv([
      {
        id: 1,
        at: '2027-01-04T04:30:00.000Z',
        actor: 'fake.owner@example.invalid',
        action: 'read-note',
        entity: 'session-notes',
        entityId: '9',
        changed: '',
      },
    ])
    expect(csv.split('\r\n')).toHaveLength(2)
    expect(csv).toContain('"4 January 2027 10 AM"')
    expect(csv).not.toMatch(/ip/i)
  })
})

describe('a case study', () => {
  const approval = {
    approverName: 'Fake Approver',
    approverRole: 'Fake Role',
    approvedOn: '2027-01-04',
    reference: 'Fake folder',
  }

  it('is approved or published only with the client’s approval recorded in full', () => {
    expect(approvalRecorded(approval)).toBe(true)
    expect(approvalRecorded({ ...approval, reference: ' ' })).toBe(false)
    expect(caseStudyProblems({ status: 'approved' }, 'awaitingApproval', true)).toEqual([
      expect.objectContaining({ path: 'clientApproval' }),
    ])
    expect(
      caseStudyProblems({ status: 'published', clientApproval: approval }, 'approved', true),
    ).toEqual([])
  })

  it('is published, and changed once published, by an owner only; anyone withdraws it', () => {
    const next = { status: 'published', clientApproval: approval }
    expect(caseStudyProblems(next, 'approved', false)).toEqual([
      expect.objectContaining({ path: 'status' }),
    ])
    expect(caseStudyProblems(next, 'published', false)).toEqual([
      expect.objectContaining({ path: 'status' }),
    ])
    expect(caseStudyProblems({ status: 'withdrawn' }, 'published', false)).toEqual([])
    expect(caseStudyProblems({ status: 'draft' }, 'draft', false)).toEqual([])
  })
})
