const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

// --- Minimal SQLite reader (b-tree leaf table pages) ---
function openDb(file) {
  const copy = path.join(os.tmpdir(), 'nixer-sqlite-' + Date.now() + '-' + path.basename(file))
  try { fs.copyFileSync(file, copy) } catch (e) { return null }
  const db = fs.readFileSync(copy)
  fs.unlinkSync(copy)
  if (db.length < 100 || db.toString('utf8', 0, 16) !== 'SQLite format 3\x00') return null
  const pageSize = db.readUInt16BE(16) || 4096
  return { db, pageSize }
}

function pageOffset(ctx, pageno) {
  return pageno === 1 ? 100 : (pageno - 1) * ctx.pageSize
}

function readVarint(buf, off) {
  let v = 0
  let n = 0
  while (n < 9) {
    const b = buf[off + n]
    v = (v << 7) | (b & 0x7f)
    n++
    if (!(b & 0x80)) break
  }
  return [v, off + n]
}

function readCellPayload(db, cellOff, usable) {
  const [len, off] = readVarint(db, cellOff)
  const [rowid, off2] = readVarint(db, off)
  const local = Math.min(len, usable - 35)
  let payload = Buffer.from(db.subarray(off2, off2 + local))
  let nextOff = off2 + local
  if (len > local) {
    // overflow chain
    let nextPage = db.readUInt32BE(nextOff)
    while (nextPage !== 0) {
      const po = pageOffset({ db, pageSize: usable === 0 ? 4096 : guessSize(db) }, nextPage) // page size needed
      break
    }
  }
  return { len, rowid, payload, hasOverflow: len > local }
}

function guessSize(db) {
  return db.readUInt16BE(16) || 4096
}

function readSerialTypes(db, start) {
  const [hdrLen, p] = readVarint(db, start)
  const types = []
  let o = start + 1
  const end = start + hdrLen
  while (o < end) {
    const [t, np] = readVarint(db, o)
    types.push(t)
    o = np
  }
  return { types, dataStart: start + hdrLen }
}

function typeLen(t) {
  if (t === 0) return 0
  if (t >= 1 && t <= 6) return t
  if (t === 7) return 8
  if (t === 8 || t === 9) return 0
  if (t >= 12) return (t - 12) / 2
  return 0
}

function scanTable(ctx, rootPage, cols) {
  const { db, pageSize } = ctx
  const usable = pageSize - 0
  const rows = []
  const walk = (pageno, depth) => {
    if (depth > 6) return
    const po = pageOffset(ctx, pageno)
    const type = db[po]
    const nCells = db.readUInt16BE(po + 3)
    const cellStart = db.readUInt16BE(po + 5)
    if (type === 13 || type === 10) {
      for (let i = 0; i < nCells; i++) {
        const cptr = po + 8 + i * 2
        const coff = db.readUInt16BE(cptr)
        const abs = po + coff
        const [len, off] = readVarint(db, abs)
        const [rowid, off2] = readVarint(db, off)
        const local = Math.min(len, usable - 35)
        let payload = db.subarray(off2, off2 + local)
        // overflow
        if (len > local) {
          let next = db.readUInt32BE(off2 + local)
          let extra = Buffer.alloc(0)
          while (next !== 0) {
            const npo = (next - 1) * pageSize
            const nlen = Math.min(pageSize - 4, len - local - extra.length)
            extra = Buffer.concat([extra, db.subarray(npo + 4, npo + 4 + nlen)])
            next = db.readUInt32BE(npo)
            if (nlen <= 0) break
          }
          payload = Buffer.concat([payload, extra])
        }
        const record = readRecord(payload)
        if (record && record.length >= cols) rows.push(record)
      }
    } else if (type === 5 || type === 2) {
      for (let i = 0; i < nCells; i++) {
        const cptr = po + 8 + i * 2
        const coff = db.readUInt16BE(cptr)
        const child = db.readUInt32BE(po + coff)
        walk(child, depth + 1)
      }
    }
  }
  walk(rootPage, 0)
  return rows
}

function readRecord(payload) {
  try {
    const { types, dataStart } = readSerialTypes(payload, 0)
    const out = []
    let o = dataStart
    for (const t of types) {
      const l = typeLen(t)
      if (t === 0) out.push(null)
      else if (t >= 1 && t <= 4) out.push(payload.readIntBE(o, t))
      else if (t === 5) out.push(payload.readIntBE(o, 6))
      else if (t === 6) out.push(payload.readIntBE(o, 8))
      else if (t === 7) out.push(payload.readDoubleBE(o))
      else if (t === 8) out.push(0)
      else if (t === 9) out.push(1)
      else if (t >= 12) out.push(payload.subarray(o, o + l).toString('utf8'))
      o += l
    }
    return out
  } catch {
    return null
  }
}

function findTable(ctx, name) {
  const rows = scanTable(ctx, 1, 5)
  for (const r of rows) {
    if (r[0] === 'table' && r[2] === name) {
      const root = parseInt(r[3], 10)
      if (!isNaN(root) && root > 1) return root
    }
  }
  return null
}

module.exports = { openDb, scanTable, findTable }
