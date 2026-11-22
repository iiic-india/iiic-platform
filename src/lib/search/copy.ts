/**
 * The words of site search, in one place (en-IN; src/brand/VOICE.md, "Interface copy"): the
 * field, the results and the empty states. Each says what is there and why, and what happens
 * with what a visitor types.
 */

/** One to nine in words, as a sentence begins with them. */
const SMALL_NUMBERS = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']

export const SEARCH_COPY = {
  title: 'Search',
  heading: 'Search the site',
  label: 'What are you looking for?',
  button: 'Search',
  /**
   * What happens with the words (docs/11 §5.3): the site counts only searches that find nothing,
   * without their words. It does not promise more: the hosting platform's request log keeps each
   * address it serves, a search's included (docs/08).
   */
  help: 'We count only the searches that find nothing, never their words.',
  covers: 'Search covers the pages, the services, the Journal and the questions people ask.',
  /**
   * One to nine in words, 10 and up in figures (VOICE.md, "Spelling, numbers and dates"):
   * "One result for", "Two results for", "12 results for".
   */
  found: (total: number) =>
    `${total >= 1 && total <= 9 ? SMALL_NUMBERS[total - 1] : total} ${total === 1 ? 'result' : 'results'} for`,
  nothing: 'Nothing on the site matches',
  nothingHelp: 'Try fewer words, or another word for the same thing. Or start from one of these:',
  partial:
    'Part of the site could not be searched just now, so a result may be missing. Try again in a minute.',
  busy: 'Too many searches reached the site at once. Try again in a minute, or start from one of these:',
  doors: 'Pages to start from',
} as const
