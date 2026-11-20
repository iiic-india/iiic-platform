/**
 * Step 0 of the Map, which is all of "Find your path" in Release 1 (docs/03 F1; docs/01):
 * one question, and each answer leads to a door. Nothing about the visitor is stored.
 */
export const WHO_FOR = ['yourself', 'family', 'organisation'] as const
export type WhoFor = (typeof WHO_FOR)[number]

export const STEP_ZERO_QUESTION = 'Who is this for?'

/**
 * The answers, in the plan's order, and where each leads. docs/03 F1 names two places that do
 * not exist yet, so their pages stand in until they do: the family part of the counselling
 * page (it waits on I-31) and the Team Map page (it comes with the pipeline, M4), which the
 * organisations page introduces.
 */
export const STEP_ZERO_CHOICES: readonly { value: WhoFor; label: string; href: string }[] = [
  { value: 'yourself', label: 'Yourself', href: '/counselling' },
  { value: 'family', label: 'Your family', href: '/counselling' },
  { value: 'organisation', label: 'Your organisation', href: '/organisations' },
]

/** Where an answer leads, or null for anything that is not one of the three answers. */
export function doorFor(answer: unknown): string | null {
  return STEP_ZERO_CHOICES.find((choice) => choice.value === answer)?.href ?? null
}
