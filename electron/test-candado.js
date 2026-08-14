const { app, BrowserWindow, session, clipboard } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const http = require('http')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-candado-test')
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
  if (!tabId) { console.log('CAD: NO_TAB'); app.exit(2); return }
  await delay(1200)

  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<html><body>hi</body></html>') })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const origin = 'http://127.0.0.1:' + port
  await ui.executeJavaScript(`window.api.tabLoad('${tabId}', '${origin}/')`)
  await delay(1500)
  await session.defaultSession.cookies.set({ url: origin, name: 'test', value: '1' })

  const openSec = () => ui.executeJavaScript(`document.querySelector('.sec-chip').click(); true`).catch(() => false)
  const waitPopup = async () => {
    for (let i = 0; i < 30; i++) { if (popups.windowFor('siteinfo-popup')) return true; await delay(200) }
    return false
  }

  await openSec()
  results.opened = await waitPopup()
  if (results.opened) {
    const pw = popups.windowFor('siteinfo-popup').webContents
    results.label = await withTimeout(pw.executeJavaScript(`(document.querySelector('.rowline .lbl') ? document.body.innerText : '').slice(0, 60)`), 4000, 'label').catch((e) => 'ERR:' + e.message)
    clipboard.clear()
    const clickedCopy = await withTimeout(pw.executeJavaScript(`(async () => { for (let i = 0; i < 30; i++) { const b = document.querySelector('[data-copy]'); if (b) { b.click(); return true } await new Promise(r => setTimeout(r, 100)) } return false })()`), 5000, 'copy').catch((e) => 'ERR:' + e.message)
    results.clickedCopy = clickedCopy === true
    await delay(800)
    results.clipboard = clipboard.readText()
    results.copyOk = results.clipboard === origin + '/'

    await openSec()
    await waitPopup()
    const pw2 = popups.windowFor('siteinfo-popup') ? popups.windowFor('siteinfo-popup').webContents : null
    if (pw2) {
      const clickedClear = await withTimeout(pw2.executeJavaScript(`(async () => { for (let i = 0; i < 30; i++) { const b = document.querySelector('[data-clear]'); if (b) { b.click(); return true } await new Promise(r => setTimeout(r, 100)) } return false })()`), 5000, 'clear').catch((e) => 'ERR:' + e.message)
      results.clickedClear = clickedClear === true
      await delay(1000)
    }
    const cks = await session.defaultSession.cookies.get({ url: origin })
    results.cookiesAfterClear = cks.length
    results.clearOk = cks.length === 0
  }

  server.close()
  console.log('CAD:', JSON.stringify(results))
  const ok = results.opened && results.clickedCopy && results.copyOk && results.clickedClear && results.clearOk
  console.log('RESULT:', ok ? 'CAD_OK' : 'CAD_FAIL')
  win.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
