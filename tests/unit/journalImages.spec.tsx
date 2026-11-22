// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it } from 'vitest'

import { ArticleBody } from '@/components/journal/ArticleBody'
import { ARTICLE_IMAGE_SIZES, articleImage, mediaOriginOf } from '@/lib/journal/images'
import type { PostDetail } from '@/lib/journal/posts'
import { nameByContent, nameUploadByContent } from '@/lib/media/fileNames'
import { IMAGE_CACHE_SECONDS, imagesConfig, mediaRemotePatterns } from '@/lib/media/nextImages'

// Images inside an article's body (docs/12 §2, §4, §9): only the media library's, with alt text
// and a size, from Payload's file route or the public bucket. Every file here is obviously fake.
const MEDIA = 'https://media.fake.example'

const media = (value: Record<string, unknown>, relationTo = 'media') => ({
  type: 'upload',
  version: 3,
  format: '',
  id: 'fake-node',
  fields: null,
  relationTo,
  value: {
    id: 1,
    url: '/api/media/file/fake-photo-0123456789ab.webp',
    alt: 'A fake photograph of an empty room',
    width: 1600,
    height: 900,
    mimeType: 'image/webp',
    filename: 'fake-photo-0123456789ab.webp',
    ...value,
  },
})

/** A Lexical body holding one paragraph and one upload node. */
const bodyWith = (node: unknown) =>
  ({
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      direction: 'ltr',
      children: [
        {
          type: 'paragraph',
          format: '',
          indent: 0,
          version: 1,
          direction: 'ltr',
          textFormat: 0,
          textStyle: '',
          children: [
            {
              type: 'text',
              text: 'Fake words.',
              format: 0,
              detail: 0,
              mode: 'normal',
              style: '',
              version: 1,
            },
          ],
        },
        node,
      ],
    },
  }) as unknown as PostDetail['body']

afterEach(() => {
  delete process.env.R2_PUBLIC_BASE_URL
})

describe('an image in an article', () => {
  it('is drawn from the media library with its alt text, its size and the column’s width', () => {
    expect(articleImage(media({}), undefined)).toEqual({
      src: '/api/media/file/fake-photo-0123456789ab.webp',
      alt: 'A fake photograph of an empty room',
      width: 1600,
      height: 900,
    })
    expect(articleImage(media({ url: `${MEDIA}/fake.webp` }), MEDIA)?.src).toBe(
      `${MEDIA}/fake.webp`,
    )
  })

  it('draws nothing without alt text, a size, an image type, or from anywhere but the media library', () => {
    const refused = [
      media({ alt: '' }),
      media({ alt: '   ' }),
      media({ alt: undefined }),
      media({ width: 0 }),
      media({ height: undefined }),
      media({ mimeType: 'application/pdf' }),
      media({}, 'documents'),
      media({ url: 'https://elsewhere.example/fake.webp' }),
      media({ url: `${MEDIA}/fake.webp` }),
      media({ url: '/api/media/file/../../users' }),
      media({ url: '/api/documents/file/fake.pdf' }),
      { ...media({}), value: 1 },
      null,
    ]
    for (const node of refused)
      expect(articleImage(node, undefined), JSON.stringify(node)).toBeNull()
    // The bucket's own origin only, over https.
    expect(articleImage(media({ url: `${MEDIA}.evil.example/x.webp` }), MEDIA)).toBeNull()
    expect(mediaOriginOf('http://media.fake.example')).toBeUndefined()
    expect(mediaOriginOf(`${MEDIA}/`)).toBe(MEDIA)
  })

  it('is drawn by next/image in a figure, at the sizes the column takes', () => {
    const html = renderToStaticMarkup(<ArticleBody body={bodyWith(media({}))} />)
    expect(html).toContain('<figure')
    expect(html).toContain('alt="A fake photograph of an empty room"')
    expect(html).toContain('width="1600"')
    expect(html).toContain('height="900"')
    expect(html).toContain(`sizes="${ARTICLE_IMAGE_SIZES}"`)
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('/_next/image?url=%2Fapi%2Fmedia%2Ffile%2Ffake-photo-0123456789ab.webp')
  })

  it('leaves out an upload it may not draw, and keeps the text around it', () => {
    const html = renderToStaticMarkup(<ArticleBody body={bodyWith(media({ alt: '' }))} />)
    expect(html).toContain('Fake words.')
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<figure')
  })
})

describe('media file names', () => {
  it('carry a hash of the content, before the extension', () => {
    const bytes = new TextEncoder().encode('fake image bytes')
    const name = nameByContent('fake-photo.jpg', bytes)
    expect(name).toMatch(/^fake-photo-[0-9a-f]{12}\.jpg$/)
    expect(nameByContent('fake-photo.jpg', bytes)).toBe(name)
    expect(nameByContent('fake-photo.jpg', new TextEncoder().encode('other bytes'))).not.toBe(name)
    expect(nameByContent('no-extension', bytes)).toMatch(/^no-extension-[0-9a-f]{12}$/)
  })

  it('are given to a file a create or an update brings, and to nothing else', () => {
    const file = {
      name: 'fake.png',
      data: Buffer.from('fake image bytes'),
      mimetype: 'image/png',
      size: 16,
    }
    const run = (operation: string, withFile = true) => {
      const req = { file: withFile ? { ...file } : undefined }
      nameUploadByContent({ args: {}, operation, req } as never)
      return req.file?.name
    }
    expect(run('create')).toMatch(/^fake-[0-9a-f]{12}\.png$/)
    expect(run('update')).toMatch(/^fake-[0-9a-f]{12}\.png$/)
    expect(run('delete')).toBe('fake.png')
    expect(run('create', false)).toBeUndefined()
  })
})

describe('next/image’s sources (next.config.ts)', () => {
  it('are Payload’s file route, and the public bucket once R2 is set, kept a month', () => {
    expect(imagesConfig(undefined)).toEqual({
      localPatterns: [{ pathname: '/api/media/file/**' }],
      remotePatterns: [],
      minimumCacheTTL: IMAGE_CACHE_SECONDS,
    })
    expect(IMAGE_CACHE_SECONDS).toBe(2_678_400)
    expect(mediaRemotePatterns(`${MEDIA}/`)).toEqual([
      { protocol: 'https', hostname: 'media.fake.example', port: '', pathname: '/**' },
    ])
    expect(mediaRemotePatterns('https://cdn.fake.example/media/')).toEqual([
      { protocol: 'https', hostname: 'cdn.fake.example', port: '', pathname: '/media/**' },
    ])
    for (const value of ['http://media.fake.example', 'not a url', '']) {
      expect(mediaRemotePatterns(value), value).toEqual([])
    }
  })
})
