import { createCanvas, loadImage, type Image } from '@napi-rs/canvas'
import jsQR from 'jsqr'

/**
 * Reads a certificate's QR code back the way a phone would (docs/18 §9): drawn to pixels on white,
 * then decoded with jsQR. The unit tests read the SVG the server drew; the e2e test reads the
 * page of the issued PDF, rendered to pixels.
 */

/** The text a QR code in an image decodes to, or null. */
export function decodeImage(image: Image | { width: number; height: number }, size = 400) {
  const canvas = createCanvas(size, size)
  const context = canvas.getContext('2d')
  context.fillStyle = '#FFFFFF'
  context.fillRect(0, 0, size, size)
  // A margin of white as the sheet gives it, so the finder patterns stand clear.
  context.drawImage(image as Image, 40, 40, size - 80, size - 80)
  const pixels = context.getImageData(0, 0, size, size)
  return jsQR(new Uint8ClampedArray(pixels.data), size, size)?.data ?? null
}

/** The text the server's SVG QR code decodes to, or null. */
export async function decodeSvg(svg: string): Promise<string | null> {
  return decodeImage(await loadImage(Buffer.from(svg)))
}

/** The QR code's SVG inside a filled certificate page: the drawing qr.ts marks as decoration. */
export function qrSvgIn(html: string): string | null {
  return /<svg aria-hidden="true" focusable="false" [\s\S]*?<\/svg>/.exec(html)?.[0] ?? null
}

/** The text a QR code anywhere in an RGBA page image decodes to, or null. */
export function decodePixels(data: Uint8ClampedArray, width: number, height: number) {
  return jsQR(data, width, height)?.data ?? null
}

/**
 * The QR code on a rendered page (a PNG): the whole page first, then each quarter, since the
 * code sits in one corner beside the seal and the signatures.
 */
export async function decodePage(png: Uint8Array): Promise<string | null> {
  const image = await loadImage(Buffer.from(png))
  const { width, height } = image
  const canvas = createCanvas(width, height)
  const context = canvas.getContext('2d')
  context.fillStyle = '#FFFFFF'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0)
  const halfW = Math.floor(width / 2)
  const halfH = Math.floor(height / 2)
  const regions: [number, number, number, number][] = [
    [0, 0, width, height],
    [halfW, halfH, width - halfW, height - halfH],
    [0, halfH, halfW, height - halfH],
    [halfW, 0, width - halfW, halfH],
    [0, 0, halfW, halfH],
  ]
  for (const [x, y, w, h] of regions) {
    const pixels = context.getImageData(x, y, w, h)
    const text = decodePixels(new Uint8ClampedArray(pixels.data), w, h)
    if (text) return text
  }
  return null
}
