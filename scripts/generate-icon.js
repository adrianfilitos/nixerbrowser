const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const SIZE = 512

function crc32(buf) {
  let table = crc32.table
  if (!table) {
    table = crc32.table = []
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c >>> 0
    }
  }
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1))
for (let y = 0; y < SIZE; y++) {
  const rowStart = y * (SIZE * 4 + 1)
  raw[rowStart] = 0
  for (let x = 0; x < SIZE; x++) {
    const t = (x + y) / (2 * SIZE)
    const inset = Math.min(x, y, SIZE - x, SIZE - y)
    let r = Math.round(0x6c + t * (0xb4 - 0x6c))
    let g = Math.round(0x7b + t * (0x4a - 0x7b))
    let b = Math.round(0xff + t * (0xe0 - 0xff))
    if (inset < 24) {
      const k = 1 - inset / 24
      r = Math.round(r + (30 - r) * k)
      g = Math.round(g + (30 - g) * k)
      b = Math.round(b + (35 - b) * k)
    }
    const o = rowStart + 1 + x * 4
    raw[o] = r
    raw[o + 1] = g
    raw[o + 2] = b
    raw[o + 3] = 255
  }
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(SIZE, 0)
ihdr.writeUInt32BE(SIZE, 4)
ihdr[8] = 8
ihdr[9] = 6
ihdr[10] = 0
ihdr[11] = 0
ihdr[12] = 0

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
])

const outDir = path.join(__dirname, '..', 'build')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'icon.png'), png)
console.log('ICON_WRITTEN:', path.join(outDir, 'icon.png'), png.length, 'bytes')
