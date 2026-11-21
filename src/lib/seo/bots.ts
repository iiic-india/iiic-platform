/**
 * The user agents Next.js renders a page for in one piece, with the metadata inside <head>
 * (plan A2). Every page renders per request (D-42) and its metadata comes from
 * generateMetadata, so for any other agent Next.js streams the head tags into the body, where a
 * crawler that reads only <head> misses the title, the canonical URL and the share image.
 *
 * Setting the option replaces Next.js's own list, so the list starts with Next.js 16.4's
 * default (next/dist/shared/lib/router/utils/html-bots.js, HTML_LIMITED_BOT_UA_RE; a unit test
 * fails when an upgrade changes it), then names Googlebot, then the link previews Next.js's list
 * leaves out, then adds the AI crawlers and fetchers that D-61 welcomes. This module is read by
 * next.config.ts at build time, so it imports nothing.
 */
const NEXT_DEFAULT_BOTS = [
  '[\\w-]+-Google',
  'Google-[\\w-]+',
  'Chrome-Lighthouse',
  'Slurp',
  'DuckDuckBot',
  'baiduspider',
  'yandex',
  'sogou',
  'bitlybot',
  'tumblr',
  'vkShare',
  'quora link preview',
  'redditbot',
  'ia_archiver',
  'Bingbot',
  'BingPreview',
  'applebot',
  'facebookexternalhit',
  'facebookcatalog',
  'Twitterbot',
  'LinkedInBot',
  'Slackbot',
  'Discordbot',
  'WhatsApp',
  'SkypeUriPreview',
  'Yeti',
  'googleweblight',
]

/**
 * Next.js leaves the main Googlebot out of its list, because Googlebot runs JavaScript and
 * finds streamed head tags once it has rendered the page (its list names only Google's other
 * crawlers, "Google-…" and "…-Google"). Named here, Googlebot, and Googlebot-Image and the
 * rest, get the title and the canonical URL inside <head> in the first response, which does
 * not wait on rendering: Google reads a canonical link only in <head>.
 */
export const SEARCH_CRAWLERS = ['Googlebot'] as const

/**
 * Link-preview fetchers Next.js's list leaves out: Google Messages, Microsoft Teams and Outlook,
 * and Pinterest. Each draws the card a shared link shows; named here, they get the metadata
 * inside <head>, as the previews Next.js lists do.
 */
export const LINK_PREVIEWS = ['GoogleMessages', 'MicrosoftPreview', 'Pinterestbot'] as const

/** AI search crawlers, the fetchers that act for a person, and the training crawlers (D-61). */
export const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-SearchBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'CCBot',
  'meta-webindexer',
  'meta-externalagent',
  'meta-externalfetcher',
  'DuckAssistBot',
  'Amzn-SearchBot',
  'Amzn-User',
  'Amazonbot',
  'MistralAI-User',
  'Bytespider',
] as const

export const HTML_LIMITED_BOTS = new RegExp(
  [...NEXT_DEFAULT_BOTS, ...SEARCH_CRAWLERS, ...LINK_PREVIEWS, ...AI_CRAWLERS].join('|'),
  'i',
)
