// Renders the AAAJ monogram from the self-hosted IBM Plex Serif file into
// path-based SVGs (committed under brand/) and the PWA raster icon set
// (public/icons/). Paths rather than <text> so rasterising never depends on a
// font being installed on the machine running the build.
//
//   node scripts/generate-icons.mjs

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as fontkit from 'fontkit'
import sharp from 'sharp'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const INK = '#0F1E2E'
const BRASS = '#B4884A'
const TEXT = 'AAAJ'
const TRACKING_EM = 0.18

const font = fontkit.openSync(
  resolve(root, 'node_modules/@fontsource/ibm-plex-serif/files/ibm-plex-serif-latin-600-normal.woff'),
)

/** Lay out TEXT with tracking and return glyph paths plus the ink bounding box, in font units. */
function layout() {
  const tracking = TRACKING_EM * font.unitsPerEm
  const glyphs = []
  let pen = 0
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  for (const glyph of font.layout(TEXT).glyphs) {
    const { minX: gx0, maxX: gx1, minY: gy0, maxY: gy1 } = glyph.bbox
    minX = Math.min(minX, pen + gx0)
    maxX = Math.max(maxX, pen + gx1)
    minY = Math.min(minY, gy0)
    maxY = Math.max(maxY, gy1)
    glyphs.push({ d: glyph.path.toSVG(), pen })
    pen += glyph.advanceWidth + tracking
  }

  return { glyphs, minX, maxX, minY, maxY }
}

const ink = layout()

/**
 * @param {number} size    tile edge in px
 * @param {number} widthPct fraction of the tile the wordmark ink should span
 * @param {number} radius  corner radius in px
 */
function monogramSvg(size, widthPct, radius) {
  const scale = (size * widthPct) / (ink.maxX - ink.minX)
  const originX = size / 2 - ((ink.minX + ink.maxX) / 2) * scale
  // Centre on the cap box (baseline to cap height), not the full ink box: letting the
  // J's descender into the calculation lifts the capitals visibly off centre.
  const baselineY = size / 2 + (ink.maxY / 2) * scale

  const paths = ink.glyphs
    .map(({ d, pen }) => `      <path transform="translate(${pen} 0)" d="${d}"/>`)
    .join('\n')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="AAAJ Work Desk">
  <rect width="${size}" height="${size}"${radius ? ` rx="${radius}"` : ''} fill="${INK}"/>
  <g fill="${BRASS}" transform="translate(${round(originX)} ${round(baselineY)}) scale(${round(scale, 6)} ${round(-scale, 6)})">
${paths}
  </g>
</svg>
`
}

function round(n, dp = 3) {
  return Number(n.toFixed(dp))
}

function write(path, contents) {
  const file = resolve(root, path)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, contents)
  return file
}

const standard = monogramSvg(512, 0.62, 82)
const maskable = monogramSvg(512, 0.46, 0)

write('brand/monogram.svg', standard)
write('brand/monogram-maskable.svg', maskable)
write('public/favicon.svg', monogramSvg(512, 0.62, 82))
console.log('brand/monogram.svg, brand/monogram-maskable.svg, public/favicon.svg')

const raster = [
  ['public/icons/icon-192.png', standard, 192],
  ['public/icons/icon-512.png', standard, 512],
  ['public/icons/maskable-512.png', maskable, 512],
  ['public/icons/apple-touch-icon.png', monogramSvg(512, 0.58, 0), 180],
]

for (const [path, svg, size] of raster) {
  const png = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer()
  write(path, png)
  console.log(`${path}  ${size}x${size}  ${png.length} bytes`)
}
