// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'

import { resolveManifest } from 'next/dist/build/webpack/loaders/metadata/resolve-route-data'
import { describe, expect, it, vi } from 'vitest'

import manifest from '@/app/manifest'

// /manifest.webmanifest (src/app/manifest.ts; docs/02): the kit's site.webmanifest as it is,
// with the icons at the addresses the build gives them. An imported image is an object with
// its address in Next.js; here each of the kit's three is faked as one, so the route is held
// to importing exactly those files.
vi.mock('@/brand/logo/png/icon-192.png', () => ({
  default: { src: '/_next/static/media/icon-192.png', width: 192, height: 192 },
}))
vi.mock('@/brand/logo/png/icon-512.png', () => ({
  default: { src: '/_next/static/media/icon-512.png', width: 512, height: 512 },
}))
vi.mock('@/brand/logo/png/icon-maskable-512.png', () => ({
  default: { src: '/_next/static/media/icon-maskable-512.png', width: 512, height: 512 },
}))

const LOGO = join(process.cwd(), 'src/brand/logo')

type KitIcon = { src: string; sizes: string; type: string; purpose: string }
const kit = JSON.parse(readFileSync(join(LOGO, 'site.webmanifest'), 'utf8')) as {
  icons: KitIcon[]
  [key: string]: unknown
}

/** The width and height a PNG file states in its header. */
function pngSize(file: Buffer): { width: number; height: number } {
  expect(file.subarray(0, 8).toString('latin1')).toBe('\x89PNG\r\n\x1a\n')
  return { width: file.readUInt32BE(16), height: file.readUInt32BE(20) }
}

describe('the web manifest', () => {
  it('is the kit’s own: its names, colours, language and start address', () => {
    const { icons: _icons, ...built } = manifest()
    const { icons: _kitIcons, ...own } = kit
    expect(built).toEqual(own)
    // The brand's yellow on its paper (CLAUDE.md #2), and the names D-63 gives.
    expect(built).toMatchObject({
      name: 'Indian Institute of Image Catalysts',
      short_name: 'IIIC',
      lang: 'en-IN',
      theme_color: '#FFDD00',
      background_color: '#F8F6F0',
      start_url: '/',
      scope: '/',
      display: 'standalone',
    })
  })

  it('lists the kit’s three icons, each at the address the build gives its file', () => {
    const icons = manifest().icons ?? []
    expect(icons.map(({ sizes, type, purpose }) => ({ sizes, type, purpose }))).toEqual(
      kit.icons.map(({ sizes, type, purpose }) => ({ sizes, type, purpose })),
    )
    expect(icons.map((icon) => icon.src)).toEqual(
      kit.icons.map((icon) => `/_next/static/media/${basename(icon.src)}`),
    )
  })

  it.each(kit.icons)(
    'has the icon file $src, a PNG of the size it states',
    ({ src, sizes, type }) => {
      const file = join(LOGO, src)
      expect(existsSync(file), file).toBe(true)
      expect(type).toBe('image/png')
      const { width, height } = pngSize(readFileSync(file))
      expect(`${width}x${height}`).toBe(sizes)
    },
  )

  it('is written by Next.js as JSON that parses back to itself', () => {
    expect(JSON.parse(resolveManifest(manifest()))).toEqual(manifest())
  })

  it('makes no claim and holds no placeholder in its description', () => {
    const { description = '' } = manifest()
    expect(description).toBe(kit.description)
    expect(description).not.toMatch(/\[\[|\]\]|TODO/)
    expect(description).not.toMatch(
      /\b(?:therap\w+|psychologists?|clinical|degrees?|diplomas?|accredit\w+|recogni[sz]ed|best|leading|first)\b/i,
    )
  })
})
