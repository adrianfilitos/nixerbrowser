const { protocol, session } = require('electron')
const path = require('path')
const fs = require('fs')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
}

const ROOT_DIR = path.join(__dirname, '..')
const PAGES_DIR = path.join(ROOT_DIR, 'pages')
const NEWTAB_FILE = path.join(ROOT_DIR, 'newtab.html')

function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'nixer', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  ])
}

function nixerToFilePath(url) {
  let u
  try { u = new URL(url) } catch { return null }
  const host = (u.hostname || '').toLowerCase()
  let rel = decodeURIComponent(u.pathname).replace(/^\/+/, '')
  let file
  if (host === 'pages') file = path.join(PAGES_DIR, rel || 'newtab.html')
  else if (host === 'newtab') file = NEWTAB_FILE
  else if (host === 'welcome') file = path.join(PAGES_DIR, 'welcome.html')
  else if (/^[a-z0-9-]+$/.test(host)) file = path.join(PAGES_DIR, host + '.html')
  else return null
  const resolved = path.resolve(file)
  if (resolved !== NEWTAB_FILE && !resolved.startsWith(PAGES_DIR + path.sep)) return null
  return resolved
}

function install(sessions) {
  const handler = (request) => {
    const file = nixerToFilePath(request.url)
    if (!file || !fs.existsSync(file)) {
      return new Response('Página no encontrada', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } })
    }
    try {
      const body = fs.readFileSync(file)
      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'
      return new Response(body, { headers: { 'content-type': type, 'cache-control': 'no-store' } })
    } catch (e) {
      return new Response('Error de lectura', { status: 500, headers: { 'content-type': 'text/plain' } })
    }
  }
  const list = Array.isArray(sessions) && sessions.length ? sessions : [session.defaultSession]
  for (const ses of list) {
    try {
      ses.protocol.handle('nixer', handler)
    } catch {}
  }
}

module.exports = { registerScheme, nixerToFilePath, install }
