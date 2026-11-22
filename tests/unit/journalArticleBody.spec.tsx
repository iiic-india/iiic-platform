// @vitest-environment node
import { buildEditorState } from '@payloadcms/richtext-lexical'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ArticleBody } from '@/components/journal/ArticleBody'
import styles from '@/components/journal/journal.module.css'
import type { PostDetail } from '@/lib/journal/posts'

// An article's body as the page draws it (src/components/journal/ArticleBody.tsx): Payload's
// Lexical converter, held to the article's outline, to the kit and to safe links. Every text
// and address is obviously fake.

const BOLD = 1
const ITALIC = 2
const STRIKETHROUGH = 4
const UNDERLINE = 8
const CODE = 16

const element = { direction: null, format: '' as const, indent: 0, version: 1 }

const text = (value: string, format = 0) => ({
  type: 'text',
  detail: 0,
  format,
  mode: 'normal',
  style: '',
  text: value,
  version: 1,
})

const paragraph = (...children: object[]) => ({
  type: 'paragraph',
  textFormat: 0,
  children,
  ...element,
})

const heading = (tag: string, value: string) => ({
  type: 'heading',
  tag,
  children: [text(value)],
  ...element,
})

const link = (fields: Record<string, unknown>, value: string) => ({
  type: 'link',
  fields,
  children: [text(value)],
  ...element,
})

const item = (value: number, ...children: object[]) => ({
  type: 'listitem',
  value,
  children,
  ...element,
})

const list = (listType: 'bullet' | 'number', ...children: object[]) => ({
  type: 'list',
  listType,
  tag: listType === 'number' ? 'ol' : 'ul',
  start: 1,
  children,
  ...element,
})

/** The page's markup for a body of the given nodes. */
function draw(...nodes: object[]): string {
  const body = buildEditorState({ nodes: nodes as never }) as PostDetail['body']
  return renderToStaticMarkup(<ArticleBody body={body} />)
}

describe('an article’s body', () => {
  it('is drawn inside the kit’s article block', () => {
    expect(draw(paragraph(text('Fake text.')))).toBe(
      '<div class="iiic-article"><p>Fake text.</p></div>',
    )
  })

  it('keeps its headings under the article’s one h1: h2 and h3 only', () => {
    const html = draw(
      heading('h1', 'Fake one'),
      heading('h2', 'Fake two'),
      heading('h3', 'Fake three'),
      heading('h4', 'Fake four'),
    )
    expect(html).not.toMatch(/<h1|<h4|<h5|<h6/)
    expect(html).toContain(
      '<h2>Fake one</h2><h2>Fake two</h2><h3>Fake three</h3><h3>Fake four</h3>',
    )
  })

  it('marks text bold or italic, and nothing else', () => {
    const html = draw(
      paragraph(
        text('fake bold', BOLD),
        text(' fake italic', ITALIC),
        text(' fake both', BOLD | ITALIC),
        text(' fake underline', UNDERLINE),
        text(' fake struck', STRIKETHROUGH),
        text(' fake code', CODE),
      ),
    )
    expect(html).toContain('<strong>fake bold</strong>')
    expect(html).toContain('<em> fake italic</em>')
    expect(html).toContain('<em><strong> fake both</strong></em>')
    expect(html).toContain(' fake underline fake struck fake code</p>')
    expect(html).not.toMatch(/<code|<u>|<s>|<sub|<sup/)
  })

  it('writes no style of its own: no alignment, no indent', () => {
    const html = draw(
      { ...paragraph(text('Fake centred.')), format: 'center' },
      { ...paragraph(text('Fake indented.')), indent: 2 },
      list('bullet', item(1, text('Fake item'))),
    )
    expect(html).not.toContain('style=')
  })

  it('follows a link only where it is safe to go, and opens another site without handing over the page', () => {
    const html = draw(
      paragraph(
        link({ linkType: 'custom', url: 'https://example.org/fake', newTab: true }, 'fake site'),
        link({ linkType: 'custom', url: 'https://example.org/same-tab' }, 'fake same tab'),
        link({ linkType: 'custom', url: '/framework' }, 'fake page'),
        link({ linkType: 'custom', url: 'mailto:fake@example.invalid' }, 'fake mail'),
        link({ linkType: 'custom', url: 'javascript:alert(1)' }, 'fake script'),
        link({ linkType: 'custom', url: 'data:text/html;base64,ZmFrZQ==' }, 'fake data'),
        link({ linkType: 'internal', doc: { relationTo: 'pages', value: 1 } }, 'fake document'),
        {
          type: 'autolink',
          fields: { url: 'https://example.org/auto' },
          children: [text('https://example.org/auto')],
          ...element,
        },
      ),
    )
    expect(html).toContain(
      '<a href="https://example.org/fake" target="_blank" rel="noopener noreferrer">fake site</a>',
    )
    expect(html).toContain(
      '<a href="https://example.org/same-tab" rel="noopener noreferrer">fake same tab</a>',
    )
    expect(html).toContain('<a href="/framework">fake page</a>')
    expect(html).toContain('<a href="mailto:fake@example.invalid" rel="noopener noreferrer">')
    expect(html).toContain(
      '<a href="https://example.org/auto" rel="noopener noreferrer">https://example.org/auto</a>',
    )
    // The rest keep their words and lose their link.
    for (const words of ['fake script', 'fake data', 'fake document']) {
      expect(html).toContain(words)
      expect(html).not.toMatch(new RegExp(`<a [^>]*>${words}</a>`))
    }
    expect(html).not.toMatch(/javascript:|data:text/)
  })

  it('numbers a numbered list, and shows no marker for the item that holds a nested list', () => {
    const html = draw(
      list('number', item(1, text('Fake first')), item(2, text('Fake second'))),
      list(
        'bullet',
        item(1, text('Fake outer')),
        item(2, list('bullet', item(1, text('Fake inner')))),
      ),
    )
    expect(html).toContain('<li value="1">Fake first</li><li value="2">Fake second</li>')
    expect(html).toContain('<li>Fake outer</li>')
    expect(html).toContain(`<li class="${styles.listHolder}"><ul`)
    expect(html).toContain('<li>Fake inner</li>')
  })

  it('draws a quote and a rule as the kit styles them', () => {
    const html = draw(
      { type: 'quote', children: [text('Fake quoted words.')], ...element },
      { type: 'horizontalrule', version: 1 },
    )
    expect(html).toContain('<blockquote>Fake quoted words.</blockquote><hr/>')
  })

  it('shows the words of a node its editor cannot make, and nothing else of it', () => {
    const html = draw(
      { type: 'fake-container', children: [text('Fake kept words.')], version: 1 },
      { type: 'upload', relationTo: 'media', value: 1, fields: {}, format: '', version: 1 },
    )
    expect(html).toContain('Fake kept words.')
    expect(html).not.toMatch(/<img|unknown node/)
  })
})
