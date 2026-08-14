const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const http = require('http')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-bounds-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const tabs = require('./tabs')
const popups = require('./popups')
const ctx = require('./ctx')
const { CHROME_HEIGHT } = require('./constants')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  const waitTab = () => ui.executeJavaScript(`(async () => { for (let i = 0; i < 60; i++) { const t = document.querySelector('.tab'); if (t && t.dataset.id) return t.dataset.id; await new Promise(r => setTimeout(r, 200)) } return null })()`)
  const tabId = await waitTab()
  if (!tabId) { console.log('NO_TAB'); app.exit(2); return }
  await delay(1000)
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<html><body style="background:#ffffff;margin:0"><h1>PAGE-VISIBLE</h1></body></html>') })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  await ui.executeJavaScript(`window.api.tabLoad('${tabId}', 'http://127.0.0.1:${port}/')`)
  await delay(2500)

  const results = {}
  const wctx = ctx.windows.get(win)
  const tab = tabs.getTab(wctx, tabId)
  if (!tab) { console.log('NO_TAB_OBJ'); app.exit(2); return }
  const view = tab.view
  const b = view.getBounds()
  const winH = win.getContentSize()[1]
  const toolbarBottom = await ui.executeJavaScript(`(async () => { for (let i = 0; i < 40; i++) { const tb = document.querySelector('.toolbar'); if (tb) return Math.round(tb.getBoundingClientRect().bottom); await new Promise(r => setTimeout(r, 150)) } return -1 })()`)
  results.yFloorOk = b.y >= CHROME_HEIGHT
  results.noBottomOverflow = b.y + b.height <= winH
  results.belowToolbar = toolbarBottom >= 0 && b.y >= toolbarBottom
  results.bounds = { x: b.x, y: b.y, width: b.width, height: b.height, winH, toolbarBottom }

  // Resize: los bounds deben recalcularse respetando el desfase.
  win.setSize(900, 620)
  await delay(1200)
  const b2 = view.getBounds()
  const winH2 = win.getContentSize()[1]
  results.resizeYOk = b2.y >= CHROME_HEIGHT && b2.y >= toolbarBottom
  results.resizeNoOverflow = b2.y + b2.height <= winH2
  results.resizeBounds = { x: b2.x, y: b2.y, width: b2.width, height: b2.height, winH: winH2 }

  // Menú nativo (hamburguesa): es una VENTANA externa. La página NUNCA se oculta.
  await ui.executeJavaScript(`(async () => { for (let i = 0; i < 40; i++) { const m = document.querySelector('.menu-btn'); if (m) { m.click(); return true } await new Promise(r => setTimeout(r, 150)) } return false })()`)
  await delay(800)
  const pop = popups.debugBounds()
  results.menuOpen = pop.length === 1
  results.menuBounds = pop[0] && pop[0].bounds
  results.pageVisibleDuringMenu = await (async () => {
    const t = tabs.getTab(wctx, tabId)
    return t && t.view && t.view.getVisible()
  })()

  // Cerrar el menú y comprobar que la página sigue visible.
  await ui.executeJavaScript(`window.api.hidePopup ? (window.api.hidePopup('toolbar-menu'), true) : true`)
  await delay(400)
  const pageShownAfterClose = await (async () => {
    const t = tabs.getTab(wctx, tabId)
    return t && t.view && t.view.getVisible()
  })()
  results.pageShownAfterClose = pageShownAfterClose

  console.log('BOUNDS:', JSON.stringify(results))
  const ok = results.yFloorOk && results.noBottomOverflow && results.belowToolbar && results.resizeYOk && results.resizeNoOverflow && results.menuOpen && results.pageVisibleDuringMenu && results.pageShownAfterClose
  console.log('RESULT:', ok ? 'BOUNDS_OK' : 'BOUNDS_FAIL')
  server.close()
  win.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
