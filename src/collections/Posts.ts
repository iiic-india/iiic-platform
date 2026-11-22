import {
  BlockquoteFeature,
  BoldFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  InlineToolbarFeature,
  ItalicFeature,
  lexicalEditor,
  LinkFeature,
  OrderedListFeature,
  ParagraphFeature,
  UnorderedListFeature,
} from '@payloadcms/richtext-lexical'
import type {
  CollectionConfig,
  FieldHook,
  RelationshipFieldManyValidation,
  RichTextFieldValidation,
  SelectFieldSingleValidation,
  TextareaFieldValidation,
  TextFieldSingleValidation,
} from 'payload'
import { relationship, richText, select, text, textarea } from 'payload/shared'

import { allow, POLICY } from '@/access/policy'
import { appliesPageRules } from '@/blocks/pageBlocks'
import { revalidatePosts } from '@/lib/content/revalidate'
import { isArticleSlug, RESERVED_SLUGS } from '@/lib/journal/addresses'
import { bodyText, readingMinutes } from '@/lib/journal/readingTime'
import {
  ARTICLE_TITLE_MAX,
  AUTHOR_NAME_MAX,
  DESCRIPTION_MAX,
  holdsWords,
  isQuestion,
  needsSearchTitle,
  QUESTION_MAX,
  SEARCH_TITLE_MAX,
  withoutPlaceholder,
} from '@/lib/journal/rules'
import { BREAKPOINTS, previewUrl } from '@/lib/preview/access'
import { FOUNDER } from '@/lib/seo/site'

/**
 * The Journal's articles (docs/04 posts; docs/05 Content; docs/content/copy-architecture.md
 * §4.8): a title, an excerpt, the body, the question every article ends with, its topics (the
 * first decides its door), its author, and its search title and description (D-65). Drafted,
 * then published, with versions, as pages are; visitors read published articles only. The
 * rules below run when an article is published and in the admin's live checks, not when a
 * draft is saved, and an unpublish passes them (appliesPageRules, as for pages).
 */

/** Each check runs only where the page rules do: on publishing, and live in the admin. */
const onPublish =
  <Value, Options extends Parameters<typeof appliesPageRules>[0]>(
    check: (value: Value, options: Options) => Promise<true | string> | true | string,
  ) =>
  (value: Value, options: Options) =>
    appliesPageRules(options) ? check(value, options) : true

/** Payload's own check of a text (required, length), then words and no placeholder. */
async function wordsWithoutPlaceholder(
  base: Promise<true | string> | true | string,
  value: unknown,
  what: string,
): Promise<true | string> {
  const checked = await base
  if (checked !== true) return checked
  const words = holdsWords(value, what)
  return words === true ? withoutPlaceholder(value) : words
}

const validateTitle: TextFieldSingleValidation = onPublish((value, options) =>
  wordsWithoutPlaceholder(text(value, options), value, 'title'),
)

const validateExcerpt: TextareaFieldValidation = onPublish((value, options) =>
  wordsWithoutPlaceholder(textarea(value, options), value, 'excerpt'),
)

const validateQuestion: TextareaFieldValidation = onPublish(async (value, options) => {
  const checked = await wordsWithoutPlaceholder(textarea(value, options), value, 'question')
  return checked === true ? isQuestion(value) : checked
})

const validateBody: RichTextFieldValidation = onPublish(async (value, options) => {
  const checked = await richText(value, options)
  return checked === true ? withoutPlaceholder(bodyText(value)) : checked
})

const validateTopics: RelationshipFieldManyValidation = onPublish((value, options) =>
  relationship(value, options),
)

const validateAuthor: SelectFieldSingleValidation = onPublish((value, options) =>
  select(value, options),
)

// Hidden, and so not checked, unless the author is someone other than the founder.
const validateAuthorName: TextFieldSingleValidation = onPublish((value, options) =>
  wordsWithoutPlaceholder(text(value, options), value, 'author’s name'),
)

/** A title longer than a tab holds needs a search title of its own (D-65). */
const validateSearchTitle: TextFieldSingleValidation = onPublish(async (value, options) => {
  const checked = await text(value, options)
  if (checked !== true) return checked
  const title = (options.data as { title?: unknown } | undefined)?.title
  if (needsSearchTitle(title) && (typeof value !== 'string' || value.trim() === '')) {
    return `The title is longer than a browser tab holds: write a search title of up to ${SEARCH_TITLE_MAX} characters.`
  }
  return withoutPlaceholder(value)
})

const validateDescription: TextareaFieldValidation = onPublish(async (value, options) => {
  const checked = await textarea(value, options)
  return checked === true ? withoutPlaceholder(value) : checked
})

/** Set when the article is first published, unless an editor gave a date; never cleared. */
const firstPublication: FieldHook = ({ value, originalDoc, data }) => {
  if (value) return value
  const stored = (originalDoc as { publishedAt?: unknown } | undefined)?.publishedAt
  if (stored) return stored
  return data?._status === 'published' ? new Date().toISOString() : value
}

/** The minutes the body takes to read, counted from the body on every save. */
const countReadingTime: FieldHook = ({ data, originalDoc }) =>
  readingMinutes(data?.body ?? (originalDoc as { body?: unknown } | undefined)?.body)

/**
 * What an article's body may hold: paragraphs, two levels of heading under the article's
 * title, bold and italic, lists, quotes, rules and links by address. No images yet: the first
 * page that draws an image from the media library adds the bucket to next/image (docs/12 §4).
 * No links to another document by reference, so that no link points at a draft.
 */
const articleEditor = lexicalEditor({
  features: [
    ParagraphFeature(),
    HeadingFeature({ enabledHeadingSizes: ['h2', 'h3'] }),
    BoldFeature(),
    ItalicFeature(),
    UnorderedListFeature(),
    OrderedListFeature(),
    BlockquoteFeature(),
    HorizontalRuleFeature(),
    LinkFeature({ enabledCollections: [] }),
    InlineToolbarFeature(),
  ],
})

export const Posts: CollectionConfig = {
  slug: 'posts',
  labels: { singular: 'Article', plural: 'Journal' },
  admin: {
    group: 'Content',
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'publishedAt', '_status', 'updatedAt'],
    description:
      'The Journal: each article answers one question in IIIC’s words and ends with a question to sit with.',
    // The article as the site will draw it, beside the editor and in a tab of its own, from its
    // newest saved version (src/lib/preview/access.ts, OS-4).
    livePreview: { url: ({ data }) => previewUrl('posts', data?.slug), breakpoints: BREAKPOINTS },
    preview: (doc) => previewUrl('posts', doc?.slug),
  },
  // src/access/policy.ts (docs/05): anyone reads a published article; owners, operators and
  // editors read drafts and earlier versions, draft and publish; owners and editors delete.
  access: {
    read: allow(POLICY.posts.read),
    readVersions: allow(POLICY.posts.readVersions),
    create: allow(POLICY.posts.create),
    update: allow(POLICY.posts.update),
    delete: allow(POLICY.posts.delete),
  },
  // Visitors read published articles without signing in, so the staff two-factor wrapper
  // (payload-totp) stays off this one operation, and the read rule asks for the code itself
  // before it shows a draft (src/collections/Pages.ts does the same).
  custom: { totp: { disableAccessWrapper: { read: true } } },
  versions: { drafts: true, maxPerDoc: 25 },
  defaultSort: '-publishedAt',
  hooks: {
    // Published, changed, unpublished: on the site at the next request (docs/12 §1, §4).
    afterChange: [
      ({ doc, previousDoc }) => {
        revalidatePosts(doc?.slug, previousDoc?.slug)
        return doc
      },
    ],
    afterDelete: [
      ({ doc }) => {
        revalidatePosts(doc?.slug)
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      maxLength: ARTICLE_TITLE_MAX,
      validate: validateTitle,
      admin: {
        description:
          'The question the article answers, as a reader would ask it (docs/12 §3). It is the heading of the page.',
      },
    },
    {
      name: 'excerpt',
      type: 'textarea',
      required: true,
      maxLength: DESCRIPTION_MAX,
      validate: validateExcerpt,
      admin: {
        description: `One or two sentences that answer the title. The Journal's lists show it, and search results do when the article has no description of its own. Up to ${DESCRIPTION_MAX} characters.`,
      },
    },
    {
      name: 'body',
      type: 'richText',
      required: true,
      editor: articleEditor,
      validate: validateBody,
    },
    {
      name: 'question',
      type: 'textarea',
      label: 'A question to sit with',
      required: true,
      maxLength: QUESTION_MAX,
      validate: validateQuestion,
      admin: {
        description:
          'Every article ends with one reflective question (docs/11 §3.6). Readers can copy it to take it with them.',
      },
    },
    {
      type: 'collapsible',
      label: 'Search results and shared links',
      fields: [
        {
          name: 'searchTitle',
          type: 'text',
          maxLength: SEARCH_TITLE_MAX,
          validate: validateSearchTitle,
          admin: {
            description: `The title in the browser tab and in search results, up to ${SEARCH_TITLE_MAX} characters: the tab adds " · IIIC" (D-65). Needed when the title is longer; otherwise the title is used.`,
          },
        },
        {
          name: 'description',
          type: 'textarea',
          maxLength: DESCRIPTION_MAX,
          validate: validateDescription,
          admin: {
            description: `One or two sentences for search results and shared links, up to ${DESCRIPTION_MAX} characters. Without one, the excerpt is used.`,
          },
        },
      ],
    },
    {
      name: 'slug',
      type: 'text',
      label: 'Address',
      required: true,
      unique: true,
      index: true,
      validate: (value: unknown) =>
        (typeof value === 'string' && isArticleSlug(value)) ||
        `Use small letters, numbers and hyphens, such as what-is-subjective-self. ${RESERVED_SLUGS.map((slug) => `"${slug}"`).join(' and ')} belong to the Journal's own addresses.`,
      admin: {
        position: 'sidebar',
        description:
          'The article lives at /journal/ and this address. Set it once: links to it stay.',
      },
    },
    {
      name: 'topics',
      type: 'relationship',
      relationTo: 'topics',
      hasMany: true,
      required: true,
      minRows: 1,
      validate: validateTopics,
      admin: {
        position: 'sidebar',
        description:
          'The first topic is the article’s home: its breadcrumb, and the page it links to after its question.',
      },
    },
    {
      name: 'author',
      type: 'select',
      required: true,
      options: [
        { label: `${FOUNDER.name}, founder`, value: 'founder' },
        { label: 'Someone else', value: 'other' },
      ],
      validate: validateAuthor,
      admin: { position: 'sidebar' },
    },
    {
      name: 'authorName',
      type: 'text',
      label: 'Author’s name',
      maxLength: AUTHOR_NAME_MAX,
      validate: validateAuthorName,
      admin: {
        position: 'sidebar',
        condition: (_data, siblingData) => siblingData?.author === 'other',
        description: 'As the author wants it shown.',
      },
    },
    {
      name: 'publishedAt',
      type: 'date',
      label: 'Publish date',
      index: true,
      // Stored in UTC, shown in Asia/Kolkata whatever the browser's zone (CLAUDE.md #8).
      timezone: {
        defaultTimezone: 'Asia/Kolkata',
        supportedTimezones: [{ label: 'India Standard Time', value: 'Asia/Kolkata' }],
      },
      hooks: { beforeChange: [firstPublication] },
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime' },
        description:
          'The date the article shows. Set when it is first published, unless you give one.',
      },
    },
    {
      name: 'readingTime',
      type: 'number',
      label: 'Minutes to read',
      access: { create: () => false, update: () => false },
      hooks: { beforeChange: [countReadingTime] },
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Counted from the body when the article is saved: 200 words a minute.',
      },
    },
  ],
}
