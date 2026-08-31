/**
 * Genera los iconos PNG de la PWA sin dependencias externas.
 * Dibuja un décimo de lotería estilizado sobre el color de marca.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')
mkdirSync(OUT, { recursive: true })

const BRAND = [176, 23, 57] // #B01739
const PAPER = [255, 252, 247]
const INK = [176, 23, 57]

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
  return Buffer.concat([length, typeBuf, data, crc])
}

function png(width, height, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    pixels.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** Rectángulo redondeado con antialiasing por supermuestreo. */
function roundedRectCoverage(x, y, rect) {
  const { left, top, right, bottom, radius } = rect
  let hits = 0
  const samples = 4
  for (let sy = 0; sy < samples; sy++) {
    for (let sx = 0; sx < samples; sx++) {
      const px = x + (sx + 0.5) / samples
      const py = y + (sy + 0.5) / samples
      if (px < left || px > right || py < top || py > bottom) continue
      const cx = Math.min(Math.max(px, left + radius), right - radius)
      const cy = Math.min(Math.max(py, top + radius), bottom - radius)
      const dx = px - cx
      const dy = py - cy
      if (dx * dx + dy * dy <= radius * radius) hits++
    }
  }
  return hits / (samples * samples)
}

function blend(base, layer, alpha) {
  return base.map((c, i) => Math.round(c * (1 - alpha) + layer[i] * alpha))
}

function drawIcon(size, { padding = 0 } = {}) {
  const pixels = Buffer.alloc(size * size * 4)
  const s = size
  const inset = s * padding
  const card = {
    left: inset + s * 0.16,
    right: s - inset - s * 0.16,
    top: inset + s * 0.24,
    bottom: s - inset - s * 0.24,
    radius: s * 0.055,
  }
  // Tres "líneas" del décimo
  const lines = [0.36, 0.5, 0.64].map((ratio, index) => ({
    left: card.left + s * 0.07,
    right: card.right - s * (index === 2 ? 0.24 : 0.07),
    top: s * ratio - s * 0.022,
    bottom: s * ratio + s * 0.022,
    radius: s * 0.022,
  }))

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      let color = BRAND
      const cardAlpha = roundedRectCoverage(x, y, card)
      if (cardAlpha > 0) color = blend(color, PAPER, cardAlpha)
      for (const line of lines) {
        const lineAlpha = roundedRectCoverage(x, y, line) * cardAlpha
        if (lineAlpha > 0) color = blend(color, INK, lineAlpha * 0.85)
      }
      const offset = (y * s + x) * 4
      pixels[offset] = color[0]
      pixels[offset + 1] = color[1]
      pixels[offset + 2] = color[2]
      pixels[offset + 3] = 255
    }
  }
  return png(s, s, pixels)
}

const outputs = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { padding: 0.1 }],
  ['apple-touch-icon.png', 180, {}],
  ['favicon-32.png', 32, {}],
]

for (const [name, size, options] of outputs) {
  writeFileSync(join(OUT, name), drawIcon(size, options))
  console.log('·', name)
}
