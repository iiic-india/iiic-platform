// Builds src/app/favicon.ico (16, 32 and 48 px) from src/app/icon.svg, for browsers that take no
// SVG icon (D-48). Run `pnpm icons` after changing the SVG, and commit both files.
import { readFile, writeFile } from 'node:fs/promises'

import sharp from 'sharp'

const SIZES = [16, 32, 48]
const svg = await readFile(new URL('../src/app/icon.svg', import.meta.url), 'utf8')

const pngs = await Promise.all(
  SIZES.map((size) =>
    sharp(Buffer.from(svg.replace('<svg ', `<svg width="${size}" height="${size}" `)))
      .png({ compressionLevel: 9 })
      .toBuffer(),
  ),
)

// An .ico file: a 6-byte header, one 16-byte entry per image, then the PNG files themselves.
const header = Buffer.alloc(6)
header.writeUInt16LE(1, 2) // 1 = icon
header.writeUInt16LE(SIZES.length, 4)

let offset = header.length + 16 * SIZES.length
const entries = pngs.map((png, index) => {
  const entry = Buffer.alloc(16)
  entry.writeUInt8(SIZES[index], 0) // width
  entry.writeUInt8(SIZES[index], 1) // height
  entry.writeUInt16LE(1, 4) // colour planes
  entry.writeUInt16LE(32, 6) // bits per pixel
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(offset, 12)
  offset += png.length
  return entry
})

const ico = Buffer.concat([header, ...entries, ...pngs])
await writeFile(new URL('../src/app/favicon.ico', import.meta.url), ico)
console.log(`favicon.ico written: ${SIZES.join(', ')} px, ${ico.length} bytes`)
