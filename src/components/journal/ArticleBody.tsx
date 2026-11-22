import { sanitizeUrl } from '@payloadcms/richtext-lexical'
import {
  type JSXConverters,
  type JSXConvertersFunction,
  RichText,
} from '@payloadcms/richtext-lexical/react'
import type { ReactNode } from 'react'

import type { PostDetail } from '@/lib/journal/posts'

import styles from './journal.module.css'

/**
 * An article's body, drawn from its Lexical text by Payload's own converter into the plain
 * elements the kit's `.iiic-article` styles (src/brand/gallery.html, "Article"). The converters
 * below hold the page to its outline and to the kit: headings are h2 and h3 under the article's
 * one h1, text is bold or italic and nothing else, no alignment or indent is written inline,
 * and a link goes only where it is safe to go. A node the article's editor cannot make
 * (src/collections/Posts.ts) shows its text, if it has any, and nothing else.
 */

/** Bold and italic, the two marks the editor offers (Lexical's format bits 1 and 2). */
const BOLD = 1
const ITALIC = 2

/** A link's address, if it is one the page may follow: the web, mail, a phone, this site. */
function safeHref(url: unknown): string | null {
  if (typeof url !== 'string' || url.trim() === '') return null
  const trimmed = url.trim()
  return sanitizeUrl(trimmed) === trimmed && !/^(?:file|ftp|data):/i.test(trimmed) ? trimmed : null
}

/** Whether an address leaves the site, so that it opens without handing over the page. */
const external = (href: string) => /^[a-z][a-z\d+.-]*:/i.test(href)

const converters: JSXConvertersFunction = ({ defaultConverters }) =>
  ({
    paragraph: defaultConverters.paragraph,
    linebreak: defaultConverters.linebreak,
    quote: defaultConverters.quote,
    horizontalrule: defaultConverters.horizontalrule,
    list: defaultConverters.list,
    text: ({ node }) => {
      let text: ReactNode = node.text
      if (node.format & BOLD) text = <strong>{text}</strong>
      if (node.format & ITALIC) text = <em>{text}</em>
      return text
    },
    heading: ({ node, nodesToJSX }) => {
      const children = nodesToJSX({ nodes: node.children })
      return node.tag === 'h1' || node.tag === 'h2' ? <h2>{children}</h2> : <h3>{children}</h3>
    },
    listitem: ({ node, nodesToJSX, parent }) => {
      const children = nodesToJSX({ nodes: node.children })
      // Lexical nests a list inside an item of its own, which then shows no marker.
      const holdsList = node.children.some((child) => child.type === 'list')
      const numbered = 'listType' in parent && parent.listType === 'number'
      return (
        <li
          className={holdsList ? styles.listHolder : undefined}
          value={numbered && !holdsList ? node.value : undefined}
        >
          {children}
        </li>
      )
    },
    link: ({ node, nodesToJSX }) => {
      const children = nodesToJSX({ nodes: node.children })
      const href = node.fields.linkType === 'internal' ? null : safeHref(node.fields.url)
      if (!href) return <>{children}</>
      const newTab = Boolean(node.fields.newTab)
      return (
        <a
          href={href}
          target={newTab ? '_blank' : undefined}
          rel={newTab || external(href) ? 'noopener noreferrer' : undefined}
        >
          {children}
        </a>
      )
    },
    autolink: ({ node, nodesToJSX }) => {
      const children = nodesToJSX({ nodes: node.children })
      const href = safeHref(node.fields.url)
      return href ? (
        <a href={href} rel={external(href) ? 'noopener noreferrer' : undefined}>
          {children}
        </a>
      ) : (
        <>{children}</>
      )
    },
    unknown: ({ node, nodesToJSX }) => {
      const children = (node as { children?: unknown }).children
      return Array.isArray(children) ? <>{nodesToJSX({ nodes: children })}</> : null
    },
  }) satisfies JSXConverters

export function ArticleBody({ body }: { body: PostDetail['body'] }) {
  return (
    <RichText
      className="iiic-article"
      data={body}
      converters={converters}
      disableIndent
      disableTextAlign
    />
  )
}
