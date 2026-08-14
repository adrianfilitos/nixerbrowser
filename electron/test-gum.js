const { app, BrowserWindow, webContents } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const http = require('http')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-gum-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const popups = require('./popups')
const tabs = require('./tabs')
const ctx = require('./ctx')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const withTimeout = (p, ms, tag) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout:' + tag)), ms))])
app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  const wctx = ctx.windows.get(win)
  const results = {}
  const waitTab = () => ui.executeJavaScript(`(async () => { for (let i = 0; i < 60; i++) { const t = document.querySelector('.tab'); if (t && t.dataset.id) return t.dataset.id; await new Promise(r => setTimeout(r, 200)) } return null })()`)
  const tabId = await waitTab()
  if (!tabId) { console.log('GUM: NO_TAB'); app.exit(2); return }
  await delay(1200)
  console.log('STEP: tab ready', tabId)

  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html')
    res.end('<html><body><script>window.gumResult = null; setTimeout(() => { navigator.mediaDevices.getUserMedia({ video: true }).then((s) => { window.gumResult = "OK:tracks=" + s.getTracks().length; s.getTracks().forEach(t => t.stop()) }).catch((e) => { window.gumResult = e.name + ": " + e.message }) }, 300)</script></body></html>')
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  console.log('STEP: server on', port)
  await ui.executeJavaScript(`window.api.tabLoad('${tabId}', 'http://127.0.0.1:${port}/')`)
  console.log('STEP: navigated')

  const modal = await (async () => {
    for (let i = 0; i < 40; i++) {
      const d = popups.debugBounds()
      if (d.some((p) => p.key === 'permission-popup')) return d.find((p) => p.key === 'permission-popup')
      await delay(200)
    }
    return null
  })()
  results.modal = !!modal
  console.log('STEP: modal', modal && JSON.stringify(modal.bounds))

  if (modal) {
    const pw = popups.windowFor('permission-popup') ? popups.windowFor('permission-popup').webContents : null
    if (pw) {
      results.staysOpen = await (async () => {
        await delay(800)
        return popups.debugBounds().some((p) => p.key === 'permission-popup')
      })()
      const permType = await withTimeout(pw.executeJavaScript(`(document.querySelector('.perm-line b') || {}).textContent || ''`), 4000, 'permType').catch((e) => 'TIMEOUT:' + e.message)
      results.permLabel = permType
      const clicked = await withTimeout(pw.executeJavaScript(`(async () => { for (let i = 0; i < 30; i++) { const b = document.querySelector('[data-m="allow"]'); if (b) { b.click(); return true } await new Promise(r => setTimeout(r, 100)) } return false })()`), 6000, 'click').catch((e) => 'TIMEOUT:' + e.message)
      results.clicked = clicked === true
    } else { results.clicked = false }
  }

  await delay(2500)
  console.log('STEP: reading gumResult')
  const tab = tabs.getTab(wctx, tabId)
  results.gumResult = tab ? await tab.wc.executeJavaScript(`window.gumResult || 'PENDING'`).catch((e) => 'JS_ERR:' + e.message) : 'NOTAB'
  console.log('STEP: gumResult read', results.gumResult)
  results.cameraQuery = tab ? await tab.wc.executeJavaScript(`navigator.permissions.query({ name: 'camera' }).then((r) => r.state).catch((e) => 'ERR:' + e.message)`).catch((e) => 'JS_ERR:' + e.message) : ''
  console.log('STEP: cameraQuery read', results.cameraQuery)
  results.micQuery = tab ? await tab.wc.executeJavaScript(`navigator.permissions.query({ name: 'microphone' }).then((r) => r.state).catch((e) => 'ERR:' + e.message)`).catch((e) => 'JS_ERR:' + e.message) : ''
  console.log('STEP: micQuery read', results.micQuery)
  const perms = await ui.executeJavaScript(`window.api.permissionsList()`).catch(() => [])
  results.perms = JSON.stringify(perms)

  server.close()
  console.log('GUM:', JSON.stringify(results))
  win.close()
  setTimeout(() => app.exit(0), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
