// @vitest-environment node
import { buildEditorState } from '@payloadcms/richtext-lexical'
import type { Field, FieldHook } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import { Posts } from '@/collections/Posts'
import { Topics } from '@/collections/Topics'

// The Journal's two collections (src/collections/Posts.ts, Topics.ts): the checks an article
// meets when it is published, and none when a draft is saved; the fields the server fills in;
// and the topic that keeps its articles. The database is not involved here: the same rules run
// against Postgres in tests/int/journal.int.spec.ts. Every value is obviously fake.

vi.mock('@/lib/content/revalidate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/content/revalidate')>()),
  revalidatePosts: vi.fn(),
  revalidateTopics: vi.fn(),
}))

type Validate = (value: unknown, options: Record<string, unknown>) => Promise<unknown> | unknown

type CheckedField = Field & { validate?: Validate }

/** A field of a collection by name, inside a collapsible or not. */
function findField(fields: Field[], name: string): CheckedField | undefined {
  for (const field of fields) {
    if ('name' in field && field.name === name) return field as CheckedField
    if ('fields' in field && Array.isArray(field.fields)) {
      const inner = findField(field.fields, name)
      if (inner) return inner
    }
  }
  return undefined
}

function fieldOf(fields: Field[], name: string): CheckedField {
  const field = findField(fields, name)
  if (!field) throw new Error(`No field ${name}`)
  return field
}

/** What Payload hands a field's check, as far as these checks read it. */
function options(field: Field, data: Record<string, unknown>, event = 'submit') {
  return {
    ...field,
    data,
    siblingData: data,
    event,
    req: { t: (key: string) => key, payload: { config: {} } },
  }
}

const PUBLISHING = { _status: 'published', title: 'A fake question?' }
const DRAFT = { _status: 'draft', title: 'A fake question?' }

/** The check of a post's field, against a document being published, or saved as a draft. */
async function check(name: string, value: unknown, data: Record<string, unknown> = PUBLISHING) {
  const field = fieldOf(Posts.fields, name)
  return field.validate?.(value, options(field, data))
}

describe('an article being published', () => {
  it('needs a title of words, without a placeholder, of up to 110 characters', async () => {
    expect(await check('title', 'A fake question?')).toBe(true)
    expect(await check('title', '[[TODO: the title, I-19]]')).not.toBe(true)
    expect(await check('title', '   ')).not.toBe(true)
    expect(await check('title', 'F'.repeat(111))).not.toBe(true)
  })

  it('ends with a question, written as one', async () => {
    expect(await check('question', 'What would a fake reader carry home?')).toBe(true)
    expect(await check('question', 'Think about a fake day.')).toMatch(/question mark/)
    expect(await check('question', 'What is [[TODO: fake, I-19]]?')).toMatch(/placeholder/)
    expect(await check('question', '')).not.toBe(true)
  })

  it('needs an excerpt that fits a search result', async () => {
    expect(await check('excerpt', 'A fake excerpt.')).toBe(true)
    expect(await check('excerpt', 'F'.repeat(156))).not.toBe(true)
    expect(await check('excerpt', 'A fake TODO excerpt.')).not.toBe(true)
  })

  it('needs a search title where its own title is longer than a tab holds (D-65)', async () => {
    const long = { ...PUBLISHING, title: `A fake question ${'that runs on '.repeat(4)}?` }
    expect(await check('searchTitle', '', long)).toMatch(/search title of up to 53/)
    expect(await check('searchTitle', null, long)).toMatch(/search title of up to 53/)
    expect(await check('searchTitle', 'A fake search title', long)).toBe(true)
    // A short title serves as its own.
    expect(await check('searchTitle', null)).toBe(true)
    expect(await check('searchTitle', 'F'.repeat(54))).not.toBe(true)
    expect(await check('searchTitle', 'Fake [[TODO: fake, I-19]]')).toMatch(/placeholder/)
  })

  it('takes a description of up to 155 characters, without a placeholder', async () => {
    expect(await check('description', null)).toBe(true)
    expect(await check('description', 'A fake description.')).toBe(true)
    expect(await check('description', 'F'.repeat(156))).not.toBe(true)
    expect(await check('description', 'Fake ]] description.')).toMatch(/placeholder/)
  })

  it('names someone else by a name without a placeholder', async () => {
    const other = { ...PUBLISHING, author: 'other' }
    expect(await check('authorName', 'Fake Author', other)).toBe(true)
    expect(await check('authorName', '[[TODO: the author, I-19]]', other)).not.toBe(true)
    expect(await check('authorName', 'F'.repeat(41), other)).not.toBe(true)
  })

  it('lives at an address of its own, never one the Journal keeps', async () => {
    expect(await check('slug', 'what-is-subjective-self')).toBe(true)
    for (const bad of ['page', 'topic', 'Fake', 'fake article', 'fake/article', '']) {
      expect(await check('slug', bad), bad).toMatch(/small letters/)
    }
  })
})

describe('an article saved as a draft, or taken off the site', () => {
  it('meets none of the checks for publishing', async () => {
    expect(await check('title', '[[TODO: the title, I-19]]', DRAFT)).toBe(true)
    expect(await check('question', 'Not a question.', DRAFT)).toBe(true)
    expect(await check('excerpt', '', DRAFT)).toBe(true)
    expect(await check('searchTitle', '', { ...DRAFT, title: 'F'.repeat(80) })).toBe(true)
  })

  it('is checked as it is typed in the admin, which shows what publishing would refuse', async () => {
    const field = fieldOf(Posts.fields, 'question')
    expect(await field.validate?.('Not a question.', options(field, DRAFT, 'onChange'))).toMatch(
      /question mark/,
    )
  })
})

describe('the fields the server fills in', () => {
  const hook = (name: string) =>
    ((fieldOf(Posts.fields, name) as { hooks?: { beforeChange?: FieldHook[] } }).hooks
      ?.beforeChange ?? [])[0] as (args: Record<string, unknown>) => unknown

  it('dates an article when it is first published, keeps the date after, and never clears it', () => {
    const date = hook('publishedAt')
    expect(date({ value: undefined, data: { _status: 'published' } })).toEqual(expect.any(String))
    expect(date({ value: undefined, data: { _status: 'draft' } })).toBeUndefined()
    expect(date({ value: '2026-11-01T00:00:00.000Z', data: { _status: 'published' } })).toBe(
      '2026-11-01T00:00:00.000Z',
    )
    expect(
      date({
        value: null,
        data: { _status: 'published' },
        originalDoc: { publishedAt: '2026-10-30T00:00:00.000Z' },
      }),
    ).toBe('2026-10-30T00:00:00.000Z')
  })

  it('counts the reading time from the body on every save, the stored body where none is sent', () => {
    const count = hook('readingTime')
    const words = (n: number) =>
      buildEditorState({ text: Array.from({ length: n }, () => 'fake').join(' ') })
    expect(count({ data: { body: words(450) } })).toBe(3)
    expect(count({ data: {}, originalDoc: { body: words(10) } })).toBe(1)
    expect(count({ data: {} })).toBe(0)
    // Only the server writes it.
    const access = (
      fieldOf(Posts.fields, 'readingTime') as { access?: Record<string, () => boolean> }
    ).access
    expect(access?.create?.()).toBe(false)
    expect(access?.update?.()).toBe(false)
  })
})

describe('a topic', () => {
  const name = fieldOf(Topics.fields, 'name')

  it('has a name of up to 30 characters, without a placeholder', async () => {
    expect(await name.validate?.('Fake topic', options(name, {}))).toBe(true)
    expect(await name.validate?.('F'.repeat(31), options(name, {}))).not.toBe(true)
    expect(await name.validate?.('Fake TODO', options(name, {}))).toMatch(/placeholder/)
    expect(await name.validate?.('  ', options(name, {}))).not.toBe(true)
  })

  it('stays while articles are filed under it, and goes once none is', async () => {
    const keep = Topics.hooks?.beforeDelete?.[0]
    const count = vi.fn()
    const req = { payload: { count } }
    count.mockResolvedValueOnce({ totalDocs: 2 })
    await expect(keep?.({ id: 7, req } as never)).rejects.toThrow(/move them to another topic/)
    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'posts', where: { topics: { in: [7] } } }),
    )
    count.mockResolvedValueOnce({ totalDocs: 0 })
    await expect(keep?.({ id: 7, req } as never)).resolves.toBeUndefined()
  })
})
