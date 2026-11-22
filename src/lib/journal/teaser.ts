/**
 * The heading of the home page's Journal section (docs/content/copy-architecture.md §4.1, row
 * 8): a candidate line, changed from the copy system's (I-41), without "every day" (I-19).
 *
 * It lives in a file with no imports, so a test that runs outside the app (the end-to-end
 * suite) can read it without loading the page blocks and their stylesheets.
 */
export const JOURNAL_TEASER_HEADING = 'A little clarity'
