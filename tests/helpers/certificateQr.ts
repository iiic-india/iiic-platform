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
