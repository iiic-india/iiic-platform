/**
 * The doors a Journal article leads to (docs/content/copy-architecture.md §4.8: "Every article
 * ends with one reflective question and a link to the matching door"). The topics are one per
 * door plus Subjective Self, the copy system's four categories, so each topic names its door
 * and an article links to its first topic's. Each link says where it goes, in the words the
 * site already uses for that page; none of them is a bridge (no offer, no booking).
 */
export const DOORS = {
  framework: {
    path: '/framework',
    name: 'Subjective Self',
    link: 'Read about Subjective Self',
  },
  organisations: {
    path: '/organisations',
    name: 'For organisations',
    link: 'Read about IIIC’s work with organisations',
  },
  learn: {
    path: '/learn',
    name: 'Learn',
    link: 'Read about the Subjective Self certification course',
  },
  counselling: {
    path: '/counselling',
    name: 'Counselling',
    link: 'Read about counselling at IIIC',
  },
} as const

export type Door = keyof typeof DOORS

/** The door choices a topic offers in the admin, each with the page it opens. */
export const DOOR_OPTIONS = (Object.keys(DOORS) as Door[]).map((door) => ({
  label: `${DOORS[door].name} (${DOORS[door].path})`,
  value: door,
}))

/**
 * Whether a Journal page is a counselling surface (CLAUDE.md #9; docs/08 §7): an article any of
 * whose topics leads to counselling, or the list of a topic that does. Such a page carries the
 * scope statement and the crisis numbers, and no experience device (docs/11 §2 item 6, §6).
 */
export function leadsToCounselling(topics: readonly { door?: unknown }[]): boolean {
  return topics.some((topic) => topic.door === 'counselling')
}

/** The door of a value read from the CMS, or none for a value no door has. */
export function doorOf(value: unknown): (typeof DOORS)[Door] | undefined {
  return typeof value === 'string' && Object.hasOwn(DOORS, value) ? DOORS[value as Door] : undefined
}
