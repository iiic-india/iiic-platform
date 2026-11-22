/**
 * The words of the 404 log's "Create redirect" panel and its list column (src/brand/VOICE.md,
 * "Interface copy"), in one place.
 */
export const REDIRECTS_COPY = {
  heading: 'Create redirect',
  intro: (path: string) =>
    `Visitors asked for ${path}, and the site has no page there. Choose the page they should find instead, and the site sends them there from now on.`,
  label: 'Send visitors to',
  hint: 'A page on this site, such as /about or /about#contact.',
  create: 'Create redirect',
  creating: 'Creating…',
  created: 'Redirect created.',
  failed: 'The redirect could not be made. Try again.',
  offline: 'No connection. Check your network and try again.',
  resolvedHeading: 'Redirected',
  resolvedTo: 'Visitors who ask for this address are sent to',
  leadsNowhere: 'The page this redirect led to has been deleted, so it sends no one anywhere.',
  openRedirect: 'Open the redirect',
  resolvedCell: 'Redirected',
  openCell: 'Not yet',
} as const
