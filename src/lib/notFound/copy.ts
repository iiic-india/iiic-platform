import { isCounsellingPath } from '@/blocks/pageBlocks'

/**
 * The 404's words and its question (docs/11 §5.1, concept A as D-29 refines it), in one place
 * (en-IN). The page owns the broken link first, then offers one question chosen by the door the
 * visitor was headed for, then gets them on their way.
 *
 * The headline, the line and the question pool in docs/11 §5.1 are proposals (`[proposal]`) that
 * IIIC approves, changes or replaces (I-41). A proposal is never shown as if it were IIIC's: until
 * IIIC approves a line, the page draws its placeholder (src/lib/content/placeholders.ts,
 * FIXED_PLACEHOLDERS), and the admin's placeholders report lists it. An approved line goes into
 * the lists below as it was approved; a line from the copy system (`[CS]`) that is only a
 * candidate goes in with `candidate: true` and is shown with the candidate marker.
 */

/** A line IIIC has approved, or, marked, a candidate line awaiting approval (I-41). */
export type NotFoundLine = { text: string; candidate?: true }

/** The pools of questions, by the door a visitor was headed for (docs/11 §5.1, item 4). */
export type QuestionPool = 'founders' | 'learners' | 'general'

/** The headline and the line that owns the broken link, once approved (I-41). */
export const NOT_FOUND_LINES: { headline: NotFoundLine | null; line: NotFoundLine | null } = {
  headline: null,
  line: null,
}

/** Each pool's approved questions (I-41): none yet. */
export const NOT_FOUND_QUESTIONS: Record<QuestionPool, readonly NotFoundLine[]> = {
  founders: [],
  learners: [],
  general: [],
}

/** The words docs/11 §5.1 gives the page around its proposals. */
export const NOT_FOUND_COPY = {
  kicker: '404 · Page not found',
  whyQuestion: 'Why a question?',
  yourLine: 'Your line (optional)',
  yourLineHelp: 'Nothing you write here is stored or sent.',
  findYourPath: 'Find your path',
  takeTheLine: 'Take the line with you',
  whereHeaded: 'Where were you headed?',
  /** The name of the eight main links' list, for a screen reader. */
  links: 'Pages to start from',
} as const

/**
 * The pool a requested path draws its question from: /organisations and /founders the founders',
 * /learn the learners', anything else the general one. Matched without regard to case, as the
 * counselling paths are.
 */
export function poolFor(path: string): QuestionPool {
  if (/^\/(organisations|founders)(\/|$)/i.test(path)) return 'founders'
  if (/^\/learn(\/|$)/i.test(path)) return 'learners'
  return 'general'
}

/**
 * The question for a requested path: one of its pool's, the same one every time for the same
 * address (a link that breaks twice asks the same question), or null while the pool has none.
 */
export function questionFor(
  path: string,
  pools: Record<QuestionPool, readonly NotFoundLine[]> = NOT_FOUND_QUESTIONS,
): NotFoundLine | null {
  const lines = pools[poolFor(path)]
  if (lines.length === 0) return null
  let sum = 0
  for (const character of path.toLowerCase()) sum = (sum + (character.codePointAt(0) ?? 0)) % 9973
  return lines[sum % lines.length] ?? null
}

/**
 * Which 404 a path gets (docs/11 §5.1, item 8): on a counselling path (/counselling or
 * /book/session and below, as the counselling pages' own rule reads it) the plain one, with no
 * question, no writing and no device, and with the scope statement and the crisis numbers;
 * everywhere else the reflective one.
 */
export function notFoundVariant(path: string): 'plain' | 'reflective' {
  return isCounsellingPath(path) ? 'plain' : 'reflective'
}
