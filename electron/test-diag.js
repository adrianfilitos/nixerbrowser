const { app, BrowserWindow, webContents } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const http = require('http')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-diag-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const tabs = require('./tabs')
const ctx = require('./ctx')
const popups = require('./popups')
const store = require('./store')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  const wctx = ctx.windows.get(win)
  const waitTab = () => ui.executeJavaScript(`(async () => { for (let i = 0; i < 60; i++) { const t = document.querySelector('.tab'); if (t && t.dataset.id) return t.dataset.id; await new Promise(r => setTimeout(r, 200)) } return null })()`)
  const tabId = await waitTab()
  if (!tabId) { console.log('NO_TAB'); app.exit(2); return }
  await delay(1000)
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html')
    if (req.url === '/perm') {
      res.end('<!doctype html><html><body><script>setTimeout(() => { navigator.geolocation.getCurrentPosition(function(){}, function(){}) }, 300)</script></body></html>')
      return
    }
    res.end('<!doctype html><html><head><style>body{background:#ffffff}@media (prefers-color-scheme: light){body{background:#ffffff}}@media (prefers-color-scheme: dark){body{background:#111111}}</style></head><body><h1 id="t">DIAGPAGE</h1></body></html>')
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  await ui.executeJavaScript(`window.api.tabLoad('${tabId}', 'http://127.0.0.1:${port}/')`)
  await delay(2000)

  const results = {}

  // Task manager devuelve filas
  results.tmRows = (await ui.executeJavaScript(`window.api.taskManagerList()`).catch(() => ({ err: true }))).rows.length

  // focus-address: foco OS del chrome
  ctx.sendUi(wctx, 'focus-address')
  await delay(700)
  results.inputFocused = await ui.executeJavaScript(`(() => { const inp = document.querySelector('.address-bar input'); return !!inp && document.activeElement === inp })()`)
  results.activeTag = await ui.executeJavaScript(`document.activeElement ? (document.activeElement.tagName + '.' + document.activeElement.className) : 'NONE'`)
  results.uiFocused = await ui.executeJavaScript(`document.hasFocus()`)
  await ui.executeJavaScript(`document.activeElement ? document.activeElement.blur() : null; true`)

  // Tema forzado claro (vía IPC real -> settings:set -> applyForcedTheme)
  await ui.executeJavaScript(`window.api.setSetting({ forcePageTheme: 'light' })`)
  await delay(300)
  await ui.executeJavaScript(`window.api.tabLoad('${tabId}', 'http://127.0.0.1:${port}/')`)
  await delay(2000)
  results.mmL = await ui.executeJavaScript(`window.api.tabExecute('${tabId}', "matchMedia('(prefers-color-scheme: dark)').matches")`)
  results.bgL = await ui.executeJavaScript(`window.api.tabExecute('${tabId}', "getComputedStyle(document.body).backgroundColor")`)
  await ui.executeJavaScript(`window.api.setSetting({ forcePageTheme: '' })`)
  await delay(300)

  // Popup de permiso nativo
  await ui.executeJavaScript(`window.api.tabLoad('${tabId}', 'http://127.0.0.1:${port}/perm')`)
  await delay(2500)
  results.permPopup = popups.count()
  results.permBounds = popups.debugBounds()
  if (popups.count()) {
    const wc = popups.debugBounds()[0]
    const perms = await ui.executeJavaScript(`window.api.permissionsList()`)
    results.permListLen = Array.isArray(perms) ? perms.length : -1
  }

  // Cursor nativo: crear vista y moverla
  await ui.executeJavaScript(`window.api.cursorMove(300, 200, true)`)
  await delay(600)
  const t0 = tabs.getTab(wctx, tabId)
  const visBefore = t0 && t0.view.getVisible()
  results.cursorViewChildren = win.contentView.children.length
  await ui.executeJavaScript(`window.api.cursorMove(0, 0, false)`)
  await delay(300)
  results.cursorHidden = true
  results.pageVisibleAfterCursorHide = t0 ? t0.view.getVisible() : null

  console.log('DIAG:', JSON.stringify(results))
  server.close()
  win.close()
  setTimeout(() => app.exit(0), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
