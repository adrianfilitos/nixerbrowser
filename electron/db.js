// Capa de base de datos SQLite (node:sqlite). Un solo archivo nixer.db en userData.
const { DatabaseSync } = require('node:sqlite')
const fs = require('fs')
const path = require('path')

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT, title TEXT, ts INTEGER);
CREATE TABLE IF NOT EXISTS bookmarks (id TEXT PRIMARY KEY, url TEXT, title TEXT, folder TEXT, ts INTEGER);
CREATE TABLE IF NOT EXISTS downloads (id TEXT PRIMARY KEY, name TEXT, url TEXT, path TEXT, received INTEGER, total INTEGER, state TEXT);
CREATE TABLE IF NOT EXISTS passwords (id TEXT PRIMARY KEY, origin TEXT, username TEXT, password TEXT, ts INTEGER);
CREATE TABLE IF NOT EXISTS session (ord INTEGER PRIMARY KEY, url TEXT, pinned INTEGER, grp TEXT);
CREATE TABLE IF NOT EXISTS extensions (id TEXT PRIMARY KEY, json TEXT);
CREATE TABLE IF NOT EXISTS recentsearches (q TEXT PRIMARY KEY, ts INTEGER);
CREATE TABLE IF NOT EXISTS readinglist (id TEXT PRIMARY KEY, title TEXT, url TEXT, text TEXT, ts INTEGER);
CREATE TABLE IF NOT EXISTS tabgroups (name TEXT PRIMARY KEY, json TEXT);
CREATE TABLE IF NOT EXISTS workspaces (name TEXT PRIMARY KEY, json TEXT);
`

let db = null

function open(dir) {
  if (db) {
    try { db.close() } catch {}
    db = null
  }
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'nixer.db')
  const created = !fs.existsSync(file)
  db = new DatabaseSync(file)
  try {
    db.exec('PRAGMA journal_mode = WAL')
  } catch {}
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec(SCHEMA)
  return { created }
}

function get() {
  return db
}

function close() {
  try { db.close() } catch {}
  db = null
}

function clearInsert(table, columns, rows) {
  db.exec('DELETE FROM ' + table)
  if (!rows.length) return
  const placeholders = columns.map(() => '?').join(',')
  const stmt = db.prepare('INSERT INTO ' + table + ' (' + columns.join(',') + ') VALUES (' + placeholders + ')')
  db.exec('BEGIN')
  try {
    for (const r of rows) stmt.run(...r)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

function selectAll(table, columns) {
  const stmt = db.prepare('SELECT ' + columns.join(',') + ' FROM ' + table)
  return stmt.all()
}

function exec(sql) {
  db.exec(sql)
}

module.exports = { open, get, close, clearInsert, selectAll, exec }
