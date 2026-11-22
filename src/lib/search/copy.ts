/**
 * The words of site search, in one place (en-IN; src/brand/VOICE.md, "Interface copy"): the
 * field, the results and the empty states. Each says what is there and why, and what happens
 * with what a visitor types.
 */
export const SEARCH_COPY = {
  title: 'Search',
  heading: 'Search the site',
  label: 'What are you looking for?',
  button: 'Search',
  /** What happens with the words (docs/11 §5.3): nothing is kept but a count of empty searches. */
  help: 'What you type is not kept. We count only searches that find nothing, without their words.',
  covers: 'Search covers the pages, the services, the Journal and the questions people ask.',
  /** "1 result for “self”", "12 results for “self”" (VOICE.md: numbers in figures). */
  found: (total: number) => `${total} ${total === 1 ? 'result' : 'results'} for`,
  nothing: 'Nothing on the site matches',
  nothingHelp: 'Try fewer words, or another word for the same thing. Or start from one of these:',
  partial:
    'Part of the site could not be searched just now, so a result may be missing. Try again in a minute.',
  busy: 'Too many searches reached the site at once. Try again in a minute, or start from one of these:',
  doors: 'Pages to start from',
} as const
