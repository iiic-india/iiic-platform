// @vitest-environment node
import { HTML_LIMITED_BOT_UA_RE } from 'next/dist/shared/lib/router/utils/html-bots'
import { describe, expect, it } from 'vitest'

import { AI_CRAWLERS, HTML_LIMITED_BOTS, LINK_PREVIEWS, SEARCH_CRAWLERS } from '@/lib/seo/bots'

// The crawlers that get each page in one piece, its metadata inside <head> (src/lib/seo/bots.ts;
// next.config.ts, htmlLimitedBots). The user agents below are written in the form each
// operator publishes; version numbers change, and the expression reads only the token.

/** The AI crawlers D-61 welcomes, by the token src/lib/seo/bots.ts lists. */
const AI_USER_AGENTS: Readonly<Record<(typeof AI_CRAWLERS)[number], string>> = {
  GPTBot:
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.3; +https://openai.com/gptbot',
  'OAI-SearchBot':
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.3; +https://openai.com/searchbot',
  'ChatGPT-User':
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
  ClaudeBot:
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  'Claude-SearchBot':
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0; +Claude-SearchBot@anthropic.com)',
  'Claude-User':
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)',
  PerplexityBot:
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
  'Perplexity-User':
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)',
  CCBot: 'CCBot/2.0 (https://commoncrawl.org/faq/)',
  'meta-webindexer':
    'meta-webindexer/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)',
  'meta-externalagent':
    'meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)',
  'meta-externalfetcher':
    'meta-externalfetcher/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)',
  DuckAssistBot: 'DuckAssistBot/1.2; (+http://duckduckgo.com/duckassistbot.html)',
  'Amzn-SearchBot':
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Amzn-SearchBot/0.1) Chrome/119.0.6045.214 Safari/537.36',
  'Amzn-User':
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Amzn-User/0.1) Chrome/119.0.6045.214 Safari/537.36',
  Amazonbot:
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot) Chrome/119.0.6045.214 Safari/537.36',
  'MistralAI-User':
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; MistralAI-User/1.0; +https://docs.mistral.ai/robots)',
  Bytespider:
    'Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36 (compatible; Bytespider; spider-feedback@bytedance.com)',
}

/** The link previews Next.js's list leaves out, by the token src/lib/seo/bots.ts lists. */
const LINK_PREVIEW_AGENTS: Readonly<Record<(typeof LINK_PREVIEWS)[number], string>> = {
  GoogleMessages: 'GoogleMessages',
  MicrosoftPreview:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0 MicrosoftPreview/2.0 +https://aka.ms/MicrosoftPreview',
  Pinterestbot: 'Mozilla/5.0 (compatible; Pinterestbot/1.0; +http://www.pinterest.com/bot.html)',
}

/** Search crawlers and link previews: Google's, Bing's, and the ones a shared link meets. */
const SEARCH_AND_PREVIEW_AGENTS = {
  'Google Messages': LINK_PREVIEW_AGENTS.GoogleMessages,
  'Microsoft Teams and Outlook': LINK_PREVIEW_AGENTS.MicrosoftPreview,
  Pinterest: LINK_PREVIEW_AGENTS.Pinterestbot,
  Googlebot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Googlebot on a phone':
    'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.69 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'Googlebot-Image': 'Googlebot-Image/1.0',
  'Google-InspectionTool': 'Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)',
  Bingbot: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  Applebot:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)',
  WhatsApp: 'WhatsApp/2.23.20.0',
  LinkedInBot:
    'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
  'Facebook and Instagram':
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
}

/** People's browsers, the two the end-to-end tests drive included. */
const BROWSERS = {
  'Chrome on Windows':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Chrome on Android':
    'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  'Safari on an iPhone':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  'Safari on a Mac':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  'Firefox on Windows':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Edge on Windows':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
}

describe('the crawlers that get the page in one piece', () => {
  it('start with the list the installed Next.js ships, so an upgrade that changes it fails here', () => {
    // Setting htmlLimitedBots replaces Next.js's list, so the list is copied into bots.ts.
    const added = [...SEARCH_CRAWLERS, ...LINK_PREVIEWS, ...AI_CRAWLERS].join('|')
    expect(HTML_LIMITED_BOTS.source).toBe(`${HTML_LIMITED_BOT_UA_RE.source}|${added}`)
    // Next.js compiles the expression again without regard to case, as its own is.
    expect(HTML_LIMITED_BOT_UA_RE.flags).toBe('i')
    expect(HTML_LIMITED_BOTS.flags).toBe('i')
  })

  it('name each crawler once, in letters, digits and hyphens only', () => {
    const added = [...SEARCH_CRAWLERS, ...LINK_PREVIEWS, ...AI_CRAWLERS]
    expect(new Set(added.map((token) => token.toLowerCase())).size).toBe(added.length)
    for (const token of added) expect(token, token).toMatch(/^[A-Za-z0-9-]+$/)
  })

  it.each(Object.entries(AI_USER_AGENTS))('include the AI crawler %s', (token, userAgent) => {
    expect(userAgent).toContain(token)
    expect(HTML_LIMITED_BOTS.test(userAgent), userAgent).toBe(true)
    // Next.js's own list knows none of them: without bots.ts they would get a streamed head.
    expect(HTML_LIMITED_BOT_UA_RE.test(userAgent), userAgent).toBe(false)
  })

  it.each(Object.entries(LINK_PREVIEW_AGENTS))(
    'include the link preview %s',
    (token, userAgent) => {
      expect(userAgent).toContain(token)
      expect(HTML_LIMITED_BOTS.test(userAgent), userAgent).toBe(true)
      // Next.js's own list knows none of them: without bots.ts they would get a streamed head.
      expect(HTML_LIMITED_BOT_UA_RE.test(userAgent), userAgent).toBe(false)
    },
  )

  it.each(Object.entries(SEARCH_AND_PREVIEW_AGENTS))('include %s', (_, userAgent) => {
    expect(HTML_LIMITED_BOTS.test(userAgent), userAgent).toBe(true)
  })

  it('include Googlebot by name, which Next.js’s own list leaves out', () => {
    const { Googlebot } = SEARCH_AND_PREVIEW_AGENTS
    expect(HTML_LIMITED_BOT_UA_RE.test(Googlebot)).toBe(false)
    expect([...SEARCH_CRAWLERS]).toEqual(['Googlebot'])
  })

  it.each(Object.entries(BROWSERS))('leave out %s', (_, userAgent) => {
    expect(HTML_LIMITED_BOTS.test(userAgent), userAgent).toBe(false)
  })
})
