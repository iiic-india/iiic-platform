import {
  APIError,
  type CollectionBeforeDeleteHook,
  type CollectionConfig,
  type TextareaFieldValidation,
  type TextFieldSingleValidation,
} from 'payload'
import { text, textarea } from 'payload/shared'

import { allow, POLICY } from '@/access/policy'
import { revalidateTopics } from '@/lib/content/revalidate'
import { JOURNAL_SLUG, TOPIC_NAME_MAX } from '@/lib/journal/addresses'
import { DOOR_OPTIONS } from '@/lib/journal/doors'
import { DESCRIPTION_MAX, holdsWords, withoutPlaceholder } from '@/lib/journal/rules'

/**
 * The Journal's topics (docs/04; docs/content/copy-architecture.md §4.8): one per door plus
 * Subjective Self, the copy system's four categories. Each names the door its articles lead to
 * (src/lib/journal/doors.ts). A topic is listed on the site once it holds a published article;
 * the topics have no drafts, so what an editor saves is public at once, as on the site.
 */

/** Payload's own check of the name (required, length), then words and no placeholder. */
const validateName: TextFieldSingleValidation = async (value, options) => {
  const base = await text(value, options)
  if (base !== true) return base
  const words = holdsWords(value, 'topic’s name')
  return words === true ? withoutPlaceholder(value) : words
}

const validateDescription: TextareaFieldValidation = async (value, options) => {
  const base = await textarea(value, options)
  return base === true ? withoutPlaceholder(value) : base
}

/** A topic that still holds articles stays, so that no article loses its door. */
const keepTopicWithArticles: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const { totalDocs } = await req.payload.count({
    collection: 'posts',
    where: { topics: { in: [id] } },
    overrideAccess: true,
    req,
  })
  if (totalDocs > 0) {
    throw new APIError(
      'Articles are filed under this topic: move them to another topic, then delete it.',
      400,
    )
  }
}

export const Topics: CollectionConfig = {
  slug: 'topics',
  labels: { singular: 'Topic', plural: 'Topics' },
  admin: {
    group: 'Content',
    useAsTitle: 'name',
    defaultColumns: ['name', 'slug', 'door', 'updatedAt'],
    description:
      'The Journal’s topics: one per door, and Subjective Self. A topic shows on the site once an article in it is published.',
  },
  // src/access/policy.ts (docs/05): anyone reads a topic; owners, operators and editors write
  // them; owners and editors delete them.
  access: {
    read: allow(POLICY.topics.read),
    create: allow(POLICY.topics.create),
    update: allow(POLICY.topics.update),
    delete: allow(POLICY.topics.delete),
  },
  // Visitors read topics without signing in, so the staff two-factor wrapper (payload-totp)
  // stays off this one operation; every write still needs a verified code.
  custom: { totp: { disableAccessWrapper: { read: true } } },
  defaultSort: 'name',
  hooks: {
    // A topic's name and door show on every list and article that carries it (docs/12 §4).
    afterChange: [
      ({ doc }) => {
        revalidateTopics()
        return doc
      },
    ],
    beforeDelete: [keepTopicWithArticles],
    afterDelete: [
      ({ doc }) => {
        revalidateTopics()
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      maxLength: TOPIC_NAME_MAX,
      validate: validateName,
      admin: {
        description: `As the list of topics and an article's breadcrumb show it. Up to ${TOPIC_NAME_MAX} characters.`,
      },
    },
    {
      name: 'slug',
      type: 'text',
      label: 'Address',
      required: true,
      unique: true,
      index: true,
      validate: (value: unknown) =>
        (typeof value === 'string' && JOURNAL_SLUG.test(value)) ||
        'Use small letters, numbers and hyphens, such as subjective-self.',
      admin: {
        position: 'sidebar',
        description: 'The topic lives at /journal/topic/ and this address.',
      },
    },
    {
      name: 'door',
      type: 'select',
      label: 'Leads to',
      required: true,
      options: DOOR_OPTIONS,
      admin: {
        position: 'sidebar',
        description: 'The page an article in this topic links to after its question.',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      maxLength: DESCRIPTION_MAX,
      validate: validateDescription,
      admin: {
        description: `One or two sentences under the topic's name, for search results and shared links too. Up to ${DESCRIPTION_MAX} characters.`,
      },
    },
  ],
}
