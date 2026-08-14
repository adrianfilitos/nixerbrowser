const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const http = require('http')
const MOCK_PORT = 18997
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-card-cloud-test')
process.env.NIXER_SKIP_AUTOCREATE = '1'
process.env.NIXER_SUPABASE_URL = 'http://127.0.0.1:' + MOCK_PORT
process.env.NIXER_SUPABASE_ANON_KEY = 'anon'
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const popups = require('./popups')
const profiles = require('./profiles')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const wto = (p, ms, tag) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout:' + tag)), ms))])
const jwt = (sub) => { const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'); const p2 = Buffer.from(JSON.stringify({ sub })).toString('base64url'); return h + '.' + p2 + '.sig' }

app.whenReady().then(async () => {
  const results = {}
  const users = new Map()
  const syncData = new Map()
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const send = (code, obj) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)) }
      try {
        if (req.url.startsWith('/auth/v1/signup')) { const b = JSON.parse(body); users.set(b.email, { uid: 'u-' + b.email.replace(/[^a-z0-9]/gi, ''), password: b.password }); return send(200, { user: { id: users.get(b.email).uid, email: b.email, user_metadata: { avatar_url: 'https://x/a.png' } } }) }
        if (req.url.startsWith('/auth/v1/token')) { const b = JSON.parse(body); const u = users.get(b.email); if (!u || u.password !== b.password) return send(400, { message: 'invalid' }); return send(200, { access_token: jwt(u.uid), refresh_token: 'rt', user: { id: u.uid, email: b.email, user_metadata: { avatar_url: 'https://x/a.png' } } }) }
        if (req.url.startsWith('/rest/v1/sync_data')) {
          if (req.method === 'POST') { const rows = JSON.parse(body); for (const r of rows) { if (!syncData.has(r.user_id)) syncData.set(r.user_id, new Map()); syncData.get(r.user_id).set(r.key, r.payload) } return send(201, rows) }
          if (req.method === 'GET') { const m = req.url.match(/user_id=eq\.([^&]+)/); const map = syncData.get(m ? m[1] : '') || new Map(); const out = []; for (const [k, v] of map) out.push({ key: k, payload: v }); return send(200, out) }
          return send(200, [])
        }
        return send(404, { message: 'nf' })
      } catch (e) { send(500, { message: String(e && e.message) }) }
    })
  })
  await new Promise((r) => server.listen(MOCK_PORT, '127.0.0.1', r))
  users.set('cloud@test.com', { uid: 'u-cloud', password: 'pass123' })

  // Firmar desde la ventana de onboarding (vía IPC) para que main abra el navegador.
  let onb = null
  for (let i = 0; i < 25 && !onb; i++) { onb = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('onboarding.html')); if (!onb) await delay(200) }
  if (onb) onb.webContents.executeJavaScript(`browserAPI.profiles.signinCloud('cloud@test.com','pass123'); true`).catch(() => {})
  let win = null
  for (let i = 0; i < 30 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws.find((w) => w.webContents.getURL().includes('index.html')) || null; if (!win) await delay(300) }
  if (!win) { console.log('NO_BROWSER'); app.exit(2); return }
  const ui = win.webContents
  await delay(1800)
  await ui.executeJavaScript(`window.confirm = function () { return true }; true`)

  await ui.executeJavaScript(`document.querySelector('.profile-avatar').click(); true`)
  let pw = null
  for (let i = 0; i < 30; i++) { if (popups.windowFor('profile-popup')) { pw = popups.windowFor('profile-popup').webContents; break } await delay(200) }
  results.cardOpen = !!pw
  if (pw) {
    results.email = await wto(pw.executeJavaScript(`(document.querySelector('.profile-email') || {}).textContent || ''`), 4000, 'email')
    results.badge = await wto(pw.executeJavaScript(`(document.querySelector('.profile-badge') || {}).textContent || ''`), 4000, 'badge')
    results.hasSync = await wto(pw.executeJavaScript(`!!document.querySelector('.profile-sync')`), 4000, 'sync')
    // Menú del navegador
    await wto(pw.executeJavaScript(`(() => { const m = Array.from(document.querySelectorAll('.profile-act')).find(a => a.textContent.includes('Menú')); if (m) m.click(); return !!m })()`), 4000, 'menu')
    await delay(900)
    results.menuOpened = !!popups.windowFor('toolbar-menu')
    // Reabrir la tarjeta para cerrar sesión
    await ui.executeJavaScript(`document.querySelector('.profile-avatar').click(); true`)
    await delay(400)
    pw = null
    for (let i = 0; i < 30; i++) { if (popups.windowFor('profile-popup')) { pw = popups.windowFor('profile-popup').webContents; break } await delay(200) }
    if (pw) {
      results.hasSignout = await wto(pw.executeJavaScript(`Array.from(document.querySelectorAll('.profile-act')).some(a => a.textContent.includes('Cerrar sesión'))`), 4000, 'signoutrow')
      await wto(pw.executeJavaScript(`(() => { const s = Array.from(document.querySelectorAll('.profile-act')).find(a => a.textContent.includes('Cerrar sesión')); if (s) s.click(); return !!s })()`), 4000, 'signout')
      await delay(1000)
    }
  }
  const cur = profiles.current()
  results.signedOut = !cur || !cur.session || !cur.session.access_token

  server.close()
  console.log('CARD:', JSON.stringify(results))
  const ok = results.cardOpen && results.email === 'cloud@test.com' && results.badge === 'Nube' && results.hasSync && results.menuOpened && results.hasSignout && results.signedOut
  console.log('RESULT:', ok ? 'CARD_OK' : 'CARD_FAIL')
  app.exit(ok ? 0 : 1)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
