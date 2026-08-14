const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const http = require('http')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-shields-popup-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const popups = require('./popups')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const withTimeout = (p, ms, tag) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout:' + tag)), ms))])
app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  const results = {}
  const waitTab = () => ui.executeJavaScript(`(async () => { for (let i = 0; i < 60; i++) { const t = document.querySelector('.tab'); if (t && t.dataset.id) return t.dataset.id; await new Promise(r => setTimeout(r, 200)) } return null })()`)
  const tabId = await waitTab()
  if (!tabId) { console.log('SH: NO_TAB'); app.exit(2); return }
  await delay(1200)

  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<html><body>hi</body></html>') })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  await ui.executeJavaScript(`window.api.tabLoad('${tabId}', 'http://127.0.0.1:${port}/')`)
  await delay(1500)

  await ui.executeJavaScript(`document.querySelector('.shield-btn').click(); true`).catch(() => {})
  const modal = await (async () => {
    for (let i = 0; i < 30; i++) {
      if (popups.windowFor('shields-popup')) return true
      await delay(200)
    }
    return false
  })()
  results.opened = modal

  if (modal) {
    const pw = popups.windowFor('shields-popup').webContents
    const switches = await withTimeout(pw.executeJavaScript(`Array.from(document.querySelectorAll('.switch')).map(s => s.dataset.k + '=' + (s.classList.contains('on') ? 1 : 0)).join('|')`), 4000, 'sw').catch((e) => 'ERR:' + e.message)
    results.before = switches
    const clicked = await withTimeout(pw.executeJavaScript(`(async () => { for (let i = 0; i < 30; i++) { const s = document.querySelector('[data-k="blockAds"]'); if (s) { s.click(); return true } await new Promise(r => setTimeout(r, 100)) } return false })()`), 5000, 'click').catch((e) => 'ERR:' + e.message)
    results.clicked = clicked === true
    await delay(1500)
    results.staysOpen = !!popups.windowFor('shields-popup')
    if (results.staysOpen) {
      results.after = await withTimeout(pw.executeJavaScript(`Array.from(document.querySelectorAll('.switch')).map(s => s.dataset.k + '=' + (s.classList.contains('on') ? 1 : 0)).join('|')`), 4000, 'after').catch((e) => 'ERR:' + e.message)
    }
    results.backend = await ui.executeJavaScript(`window.api.shieldsGet('http://127.0.0.1:${port}')`).catch((e) => 'ERR:' + e.message)
    const clicked2 = await withTimeout(pw.executeJavaScript(`(async () => { for (let i = 0; i < 30; i++) { const s = document.querySelector('[data-k="blockAds"]'); if (s) { s.click(); return true } await new Promise(r => setTimeout(r, 100)) } return false })()`), 5000, 'click2').catch((e) => 'ERR:' + e.message)
    results.clicked2 = clicked2 === true
    await delay(1500)
    if (popups.windowFor('shields-popup')) {
      results.after2 = await withTimeout(pw.executeJavaScript(`(document.querySelector('[data-k="blockAds"]') || {}).classList ? (document.querySelector('[data-k="blockAds"]').classList.contains('on') ? 1 : 0) : 'ERR'`), 4000, 'after2').catch((e) => 'ERR:' + e.message)
    }
    results.backend2 = await ui.executeJavaScript(`window.api.shieldsGet('http://127.0.0.1:${port}')`).catch((e) => 'ERR:' + e.message)
  }

  server.close()
  console.log('SH:', JSON.stringify(results))
  const ok = results.opened && results.staysOpen && results.clicked && typeof results.after === 'string' && results.after.includes('blockAds=0') && results.backend && results.backend.blockAds === false && results.clicked2 && String(results.after2) === '1' && results.backend2 && results.backend2.blockAds === true
  console.log('RESULT:', ok ? 'SH_OK' : 'SH_FAIL')
  win.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
