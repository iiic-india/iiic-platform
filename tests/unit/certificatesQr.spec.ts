// @vitest-environment node
import { createCanvas, loadImage } from '@napi-rs/canvas'
import jsQR from 'jsqr'
import { describe, expect, it } from 'vitest'

import { qrSvg } from '@/lib/certificates/qr'
import { verifyUrl } from '@/lib/certificates/token'

// The QR code is drawn on the server as SVG (docs/18 §4). This reads it back the way a phone
// would: the SVG drawn to pixels, then decoded. The PDF's own code is read the same way after
// M3's renderer is joined (tests/e2e/certificates.e2e.spec.ts).

async function decodeSvg(svg: string): Promise<string | null> {
  const size = 400
  const image = await loadImage(Buffer.from(svg))
  const canvas = createCanvas(size, size)
  const context = canvas.getContext('2d')
  context.fillStyle = '#FFFFFF'
  context.fillRect(0, 0, size, size)
  // A margin of white as the sheet gives it, so the finder patterns stand clear.
  context.drawImage(image, 40, 40, size - 80, size - 80)
  const pixels = context.getImageData(0, 0, size, size)
  return jsQR(new Uint8ClampedArray(pixels.data), size, size)?.data ?? null
}

describe('the certificate QR code', () => {
  const url = verifyUrl('https://example.invalid', 'AbCdEfGhIjKlMnOpQrStUv')

  it('is an SVG that decodes to the verify address', async () => {
    const svg = await qrSvg(url)
    expect(svg.startsWith('<svg ')).toBe(true)
    expect(svg).toContain('aria-hidden="true"')
    expect(await decodeSvg(svg)).toBe(url)
  })

  it('carries nothing but the address: no script, no external reference', async () => {
    const svg = await qrSvg(url)
    expect(svg).not.toMatch(/<script|href=|xlink/i)
  })
})
