import { answeredBySite, sectionOf, withoutSection } from './paths'
import { type RedirectId, type Rule, sameId } from './table'

/**
 * Redirects never chain and never loop (docs/12 §3: a redirect leads straight to a page). A
 * visitor sent from one address to another that redirects again waits for two answers, and a
 * search engine may stop following; a loop never ends. Every redirect is checked against the
 * others before it is saved, and publishing a page at a new address re-points the redirects
 * that led to its old one instead of adding a step.
 */

/** What a refused redirect says (src/brand/VOICE.md, "Interface copy": errors say what to do). */
export const CHAIN_MESSAGES = {
  self: 'A redirect cannot lead back to its own address. Choose another page to send visitors to.',
  taken: (from: string) =>
    `${from} already has a redirect. Change that one instead of adding another.`,
  onward: (to: string, next: string) =>
    `${to} redirects to ${next} itself. Send visitors straight to ${next}.`,
  inward: (from: string, origin: string) =>
    `${origin} redirects to ${from}, so this would add a second step. Point ${origin} at the new address first, or remove it.`,
  home: 'The home page keeps its address, "home": a redirect cannot start at /. Change the page itself instead of its address.',
} as const

/** A refusal, and the field it belongs to in the admin. */
export type ChainProblem = { field: 'from' | 'to'; message: string }

/**
 * Why a redirect would make a chain or a loop with the others, or null when it would not. Each
 * rule's `to` is where it leads now (src/lib/redirects/table.ts). The others may include the
 * redirect itself (by id), which is then left out.
 */
export function chainProblem(
  rule: Pick<Rule, 'id' | 'from' | 'to'>,
  all: readonly Pick<Rule, 'id' | 'from' | 'to'>[],
): ChainProblem | null {
  const target = withoutSection(rule.to)
  if (target === rule.from) return { field: 'to', message: CHAIN_MESSAGES.self }
  const others = all.filter((other) => !sameId(other.id, rule.id))
  if (others.some((other) => other.from === rule.from)) {
    return { field: 'from', message: CHAIN_MESSAGES.taken(rule.from) }
  }
  const onward = others.find((other) => other.from === target)
  if (onward) {
    return { field: 'to', message: CHAIN_MESSAGES.onward(target, withoutSection(onward.to)) }
  }
  const inward = others.find((other) => withoutSection(other.to) === rule.from)
  if (inward) return { field: 'from', message: CHAIN_MESSAGES.inward(rule.from, inward.from) }
  return null
}

export type PublishPlan = {
  /** Redirects from the page's address: the page lives there now, so they would never be followed. */
  remove: RedirectId[]
  /** Redirects to an address that led to the page's old one, sent straight to the new one, each keeping its section. */
  retarget: { id: RedirectId; url: string }[]
  /** A redirect to add from the page's old address to the page itself, by reference; null when none is added. */
  create: { from: string } | null
}

/**
 * What publishing a page does to the redirects (docs/12 §3, URLs; D-57). A redirect from the
 * page's address goes, since the page lives there now. When the page was live at another
 * address before (`movedFrom`), that address redirects to the page by reference, so it follows
 * the page through any later move too; the redirects that named the old address now name the
 * new one; and the redirects that lead to the page by reference follow it by themselves. An old
 * address that already has a redirect of its own keeps it, and one the site answers itself gets
 * none. Moving a page back to an address it had before is a move like any other. Refused, with
 * the reason, if the page would take the home page's address away, or if a redirect this
 * publish writes would still chain or loop. A chain elsewhere among the redirects, which this
 * publish does not touch, does not hold a page back.
 *
 * `rules` are the redirects as they are once the page is saved: those leading to it by
 * reference already lead to its new address.
 */
export function planPublish(
  page: { id: RedirectId; address: string; movedFrom?: string },
  rules: readonly Rule[],
): PublishPlan | { refused: string } {
  const { id: pageId, address, movedFrom } = page
  const moved = movedFrom !== undefined && movedFrom !== address
  if (moved && movedFrom === '/') return { refused: CHAIN_MESSAGES.home }

  const remove = rules.filter((rule) => rule.from === address)
  const kept = rules.filter((rule) => rule.from !== address)
  if (!moved) return { remove: ids(remove), retarget: [], create: null }

  const existing = kept.find((rule) => rule.from === movedFrom)
  const retarget = kept
    .filter(
      (rule) =>
        rule !== existing && rule.pageId === undefined && withoutSection(rule.to) === movedFrom,
    )
    .map((rule) => ({ id: rule.id as RedirectId, url: `${address}${sectionOf(rule.to)}` }))
  const create = existing || answeredBySite(movedFrom) ? null : { from: movedFrom }

  // The redirects as they will be, each one this publish writes checked against the rest.
  const newUrl = new Map(retarget.map((rule) => [String(rule.id), rule.url]))
  const after: Rule[] = kept.map((rule) => ({
    ...rule,
    to: newUrl.get(String(rule.id)) ?? rule.to,
  }))
  const added: Rule | null = create ? { from: create.from, to: address, pageId } : null
  if (added) after.push(added)
  const written = after.filter((rule) => rule === added || newUrl.has(String(rule.id)))
  for (const rule of written) {
    const problem = chainProblem(
      rule,
      after.filter((other) => other !== rule),
    )
    if (problem) return { refused: problem.message }
  }
  return { remove: ids(remove), retarget, create }
}

const ids = (rules: readonly Rule[]) => rules.flatMap((rule) => rule.id ?? [])
