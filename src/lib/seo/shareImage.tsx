import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ImageResponse } from 'next/og'

import metrics from './fonts/fraunces-latin-opsz144-wght500.metrics.json'
import { SHARE_IMAGE_SIZE } from './metadata'
import { hasPlaceholder, SITE_ALTERNATE_NAMES, SITE_NAME } from './site'

/**
 * A page's share image (plan A8; docs/12 §3): the picture a link to the page shows in WhatsApp,
 * LinkedIn, Slack and the rest. It follows the kit's social banners
 * (src/brand/templates/social/social.html): paper, the kicker with its bar, the page's title in
 * Fraunces, and the mark on the one yellow field. Nothing is dark and the yellow sits on paper
 * (CLAUDE.md #2). It states only the page's title, the institute's name and its city.
 *
 * No request leaves the server while it is drawn. The image library (next/og, which wraps
 * satori) asks fonts.googleapis.com for a font whenever a character has no glyph in the fonts it
 * was given, sending the characters along, and cdn.jsdelivr.net for a picture of every emoji; it
 * has no option that turns either off. So a title is first reduced to the characters the
 * bundled Fraunces holds (shareImageTitle): nothing is ever missing, and a page's title is never
 * sent anywhere.
 */

type ImageOptions = NonNullable<ConstructorParameters<typeof ImageResponse>[1]>
type Fonts = NonNullable<ImageOptions['fonts']>

/**
 * The kit's colours, by token. The image library reads no CSS variables, so the values are
 * copied here; tests/unit/seoShareImage.spec.tsx holds each to src/brand/css/01-tokens.css.
 */
export const SHARE_IMAGE_COLOURS = {
  /** The ground. */
  '--iiic-paper': '#F8F6F0',
  /** The field behind the mark, and the kicker's bar. */
  '--iiic-yellow': '#FFDD00',
  /** The title. */
  '--iiic-ink': '#1C262B',
  /** The kicker. */
  '--iiic-slate': '#43525A',
  /** The city. */
  '--iiic-slate-500': '#5E6C74',
} as const

/** The city of IIIC's address (src/lib/site/contact.ts, D-31); a test holds it to the address. */
export const SHARE_IMAGE_CITY = 'Ahmedabad'

// The artboard, in pixels: the copy on the left, the yellow field with the mark on the right.
const PADDING = 72
const FIELD_WIDTH = 336
const COPY_GAP = 56
const KICKER_HEIGHT = 28
const CITY_HEIGHT = 32
const TITLE_GAP = 32
/** The mark at its own proportions (src/brand/logo/iiic-mark.svg, viewBox 235 by 418.34). */
const MARK = { width: 198, height: 352 }

/**
 * The room a title has on the artboard. A title is sized to fit inside it, so it never reaches
 * the kicker, the city, the field or an edge.
 */
export const SHARE_IMAGE_TITLE_BOX = {
  left: PADDING,
  top: PADDING + KICKER_HEIGHT + TITLE_GAP,
  width: SHARE_IMAGE_SIZE.width - FIELD_WIDTH - PADDING - COPY_GAP,
  height: SHARE_IMAGE_SIZE.height - 2 * PADDING - KICKER_HEIGHT - CITY_HEIGHT - 2 * TITLE_GAP,
} as const

// A display heading as the kit sets one (src/brand/css/03-components.css, h1): Fraunces at
// weight 500 and optical size 144 (the font file), with the kit's tight leading and tracking.
/** --iiic-leading-tight. */
export const SHARE_IMAGE_TITLE_LEADING = 1.05
/** --iiic-tracking-tight, in em. */
const TITLE_TRACKING = -0.02

/**
 * The settings a title may take, largest first: the first one it fits is used. A short title is
 * set large on one or two lines, a page's usual title (up to 53 characters) on three, and only
 * a far longer one goes smaller. Every setting leaves room in the title box for one line more
 * than it allows, should the library ever break a line the estimate did not (a test holds that).
 */
export const SHARE_IMAGE_TITLE_SETTINGS = [
  { size: 96, lines: 2 },
  { size: 84, lines: 3 },
  { size: 72, lines: 3 },
  { size: 64, lines: 4 },
  { size: 56, lines: 5 },
  { size: 48, lines: 6 },
  { size: 40, lines: 7 },
] as const

const ADVANCES: Readonly<Record<string, number>> = metrics.advances

/** A character's advance in the bundled Fraunces, in font units; undefined if it has no glyph. */
function advanceOf(char: string): number | undefined {
  return ADVANCES[String(char.codePointAt(0))]
}

/** The width of a run of characters at a size, in pixels, from the font's own advances. */
function widthOf(text: string, size: number): number {
  let units = 0
  for (const char of text) units += advanceOf(char) ?? 0
  return (units * size) / metrics.unitsPerEm
}

/**
 * How a title sets at a size: the most lines it takes, and whether a word is wider than a line.
 * Words go on a line while they fit, as the library sets them, and a word wider than the line
 * is broken between letters. The widths leave out kerning and the heading's negative tracking,
 * which draw the letters closer, so the library needs no more lines than this.
 */
function setAt(title: string, size: number): { lines: number; breakWords: boolean } {
  const room = SHARE_IMAGE_TITLE_BOX.width
  const space = widthOf(' ', size)
  let lines = 1
  let line = 0
  let breakWords = false
  for (const word of title.split(' ')) {
    const width = widthOf(word, size)
    if (width > room) {
      breakWords = true
      if (line > 0) lines += 1
      line = 0
      for (const char of word) {
        const charWidth = widthOf(char, size)
        if (line + charWidth > room) {
          lines += 1
          line = charWidth
        } else {
          line += charWidth
        }
      }
    } else if (line > 0 && line + space + width > room) {
      lines += 1
      line = width
    } else {
      line += (line > 0 ? space : 0) + width
    }
  }
  return { lines, breakWords }
}

export type ShareImageTitleFit = {
  /** The font size, in pixels. */
  size: number
  /** Whether a word is wider than a line at that size, and so is broken between letters. */
  breakWords: boolean
}

/**
 * How a title is set: the first setting it fits (the largest), or null when it fits none, which
 * takes a title several times the 53 characters a page's title may hold.
 */
export function shareImageTitleFit(title: string): ShareImageTitleFit | null {
  for (const { size, lines } of SHARE_IMAGE_TITLE_SETTINGS) {
    const set = setAt(title, size)
    if (set.lines <= lines) return { size, breakWords: set.breakWords }
  }
  return null
}

/** Hyphens and dashes the font lacks, by code point, as the ones it holds. */
const STAND_INS = new Map<number, string>([
  [0x00ad, ''], // a soft hyphen is never drawn
  [0x2010, '-'], // hyphen
  [0x2011, '-'], // non-breaking hyphen
  [0x2012, String.fromCodePoint(0x2013)], // figure dash, as an en dash
  [0x2015, String.fromCodePoint(0x2014)], // horizontal bar, as an em dash
])

const MARK_CHARACTER = /\p{M}/u
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u

/** What is drawn for one character: itself, its base letter without accents, or nothing. */
function drawable(char: string): string {
  const standIn = STAND_INS.get(char.codePointAt(0) ?? -1)
  if (standIn !== undefined) return standIn
  // The library places no combining marks, so one that stands alone is left out.
  if (MARK_CHARACTER.test(char)) return ''
  if (advanceOf(char) !== undefined) return char
  const base = [...char.normalize('NFD')].filter((part) => !MARK_CHARACTER.test(part))
  return base.length > 0 && base.every((part) => advanceOf(part) !== undefined) ? base.join('') : ''
}

/**
 * The heading the image draws for a page's title: the title in the characters the bundled
 * Fraunces holds (basic Latin, Latin-1, the usual punctuation and the rupee sign), so that the
 * library never looks for a font or an emoji elsewhere. A letter the font lacks keeps its base
 * letter ("ā" is drawn "a"); other scripts and emoji are left out, with the punctuation that
 * only stood beside them. The institute's name stands in for a title that holds a placeholder
 * (CLAUDE.md #1), of which nothing is left, or that is too long to set whole.
 */
export function shareImageTitle(title: string): string {
  if (hasPlaceholder(title)) return SITE_NAME
  const words = title.normalize('NFC').split(/\s+/u).filter(Boolean)
  const drawn = words.map((word) => {
    const kept = [...word].map(drawable).join('')
    // What is left of a word without its letters ("(🙂)" as "()") is left out with them.
    return kept === word || LETTER_OR_DIGIT.test(kept) ? kept : ''
  })
  let kept = drawn
  if (drawn.some((word, index) => word !== words[index])) {
    // Something was left out: a separator that now starts or ends the title, or follows
    // another, goes with it.
    kept = []
    for (const word of drawn.filter(Boolean)) {
      const last = kept.at(-1)
      const afterSeparator = last === undefined || !LETTER_OR_DIGIT.test(last)
      if (LETTER_OR_DIGIT.test(word) || !afterSeparator) kept.push(word)
    }
    const last = kept.at(-1)
    if (last !== undefined && !LETTER_OR_DIGIT.test(last)) kept.pop()
  }
  const heading = kept.join(' ')
  return heading !== '' && shareImageTitleFit(heading) ? heading : SITE_NAME
}

/**
 * The two labels beside a heading. The image names the institute and its city once: the name
 * as the kicker and the city below, unless the heading already says either. Where the heading
 * holds the full name (the home page, /about), the kicker is the short one.
 */
export function shareImageLabels(heading: string): { kicker: string; city: string } {
  const said = heading.toLowerCase()
  return {
    kicker: said.includes(SITE_NAME.toLowerCase())
      ? SITE_ALTERNATE_NAMES[0]
      : SITE_NAME.toUpperCase(),
    city: said.includes(SHARE_IMAGE_CITY.toLowerCase()) ? '' : SHARE_IMAGE_CITY,
  }
}

type Assets = { fonts: Fonts; mark: string }

let assets: Promise<Assets> | undefined

/**
 * The fonts and the mark, read once per server instance. Each path is written out in full
 * inside its own readFile call: that is how the build finds the files this function needs and
 * ships them with it (Next.js traces `join(process.cwd(), '…')`). The fonts are static cuts of
 * the kit's own (./fonts/README.md); the mark is the kit's master file, drawn as it is.
 */
function loadAssets(): Promise<Assets> {
  assets ??= Promise.all([
    readFile(join(process.cwd(), 'src/lib/seo/fonts/fraunces-latin-opsz144-wght500.ttf')),
    readFile(join(process.cwd(), 'src/lib/seo/fonts/manrope-latin-wght800.ttf')),
    readFile(join(process.cwd(), 'src/lib/seo/fonts/manrope-latin-wght600.ttf')),
    readFile(join(process.cwd(), 'src/brand/logo/iiic-mark.svg'), 'base64'),
  ]).then(
    ([fraunces, manropeBlack, manropeSemibold, mark]): Assets => ({
      fonts: [
        { name: 'Fraunces', data: fraunces, weight: 500, style: 'normal' },
        { name: 'Manrope', data: manropeBlack, weight: 800, style: 'normal' },
        { name: 'Manrope', data: manropeSemibold, weight: 600, style: 'normal' },
      ],
      mark: `data:image/svg+xml;base64,${mark}`,
    }),
    (error: unknown) => {
      // A failed read is not kept: the next request tries again.
      assets = undefined
      throw error
    },
  )
  return assets
}

export type ShareImageInput = {
  /** The page's search title. Left out for the home page, whose image carries the name. */
  title?: string
  /** The home page: the institute's name is the heading. */
  home?: boolean
}

/**
 * The share image of a page, 1200 by 630, as a PNG response. The home page's, and that of a
 * page whose title cannot be drawn, carries the institute's name under its short name; every
 * other page's carries the page's title under the institute's name.
 */
export async function shareImage({ title, home = false }: ShareImageInput): Promise<ImageResponse> {
  const { fonts, mark } = await loadAssets()
  const colour = SHARE_IMAGE_COLOURS
  const heading = home || title === undefined ? SITE_NAME : shareImageTitle(title)
  // Every heading fits a setting: shareImageTitle gives the name for a title that fits none,
  // and the name fits the largest (a test holds that).
  const { size, breakWords } = shareImageTitleFit(heading) ?? {
    size: SHARE_IMAGE_TITLE_SETTINGS[0].size,
    breakWords: false,
  }
  const { kicker, city } = shareImageLabels(heading)

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: SHARE_IMAGE_SIZE.width,
        height: SHARE_IMAGE_SIZE.height,
        backgroundColor: colour['--iiic-paper'],
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: SHARE_IMAGE_SIZE.width - FIELD_WIDTH,
          height: SHARE_IMAGE_SIZE.height,
          paddingTop: PADDING,
          paddingBottom: PADDING,
          paddingLeft: PADDING,
          paddingRight: COPY_GAP,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', height: KICKER_HEIGHT }}>
          <div
            style={{
              width: 7,
              height: 24,
              marginRight: 14,
              borderRadius: 1,
              backgroundColor: colour['--iiic-yellow'],
            }}
          />
          <div
            style={{
              fontFamily: 'Manrope',
              fontWeight: 800,
              fontSize: 22,
              lineHeight: `${KICKER_HEIGHT}px`,
              letterSpacing: 22 * 0.16,
              color: colour['--iiic-slate'],
            }}
          >
            {kicker}
          </div>
        </div>
        <div style={{ display: 'flex', flexGrow: 1, alignItems: 'center' }}>
          <div
            style={{
              width: SHARE_IMAGE_TITLE_BOX.width,
              fontFamily: 'Fraunces',
              fontWeight: 500,
              fontSize: size,
              lineHeight: SHARE_IMAGE_TITLE_LEADING,
              letterSpacing: size * TITLE_TRACKING,
              color: colour['--iiic-ink'],
              // Lines of even length, or, for a word wider than a line, a break inside it.
              // Never both: the library, asked to balance, tries narrower lines and would
              // then break ordinary words between letters too.
              ...(breakWords ? { wordBreak: 'break-word' } : { textWrap: 'balance' }),
            }}
          >
            {heading}
          </div>
        </div>
        <div
          style={{
            height: CITY_HEIGHT,
            fontFamily: 'Manrope',
            fontWeight: 600,
            fontSize: 26,
            lineHeight: `${CITY_HEIGHT}px`,
            color: colour['--iiic-slate-500'],
          }}
        >
          {city}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: FIELD_WIDTH,
          height: SHARE_IMAGE_SIZE.height,
          backgroundColor: colour['--iiic-yellow'],
        }}
      >
        {/* The library draws this element itself; next/image has no part in it. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mark} width={MARK.width} height={MARK.height} alt="" />
      </div>
    </div>,
    { ...SHARE_IMAGE_SIZE, fonts },
  )
}
