const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-full-diag')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const popups = require('./popups')
const tabs = require('./tabs')
const ctx = require('./ctx')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 30 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  await delay(2500)
  const results = {}
  const tabCount = () => ui.executeJavaScript(`document.querySelectorAll('.tab').length`)
  results.tabsAfter2500 = await tabCount()
  await delay(4000)
  results.tabsAfter6500 = await tabCount()
  if (results.tabsAfter6500 === 0) {
    await ui.executeJavaScript(`(document.querySelector('.new-tab') || {}).click ? (document.querySelector('.new-tab').click(), true) : false`).catch(() => {})
    await delay(2500)
    results.tabsAfterNewTab = await tabCount()
  }
  results.tabsInMain = (() => { const w = ctx.windows.get(win); return w ? Array.from(w.tabs.keys()).map((k) => { const t = w.tabs.get(k); return { id: k, type: t.wc.getType(), url: t.wc.getURL() } }) : null })()

  // Estado de la ventana y la UI
  results.winUrl = win.webContents.getURL()
  results.winTitle = win.getTitle()
  results.winsCount = BrowserWindow.getAllWindows().length
  results.contentViewChildren = (() => { try { return win.contentView.children.length } catch (e) { return 'ERR:' + e.message } })()
  results.ui = await ui.executeJavaScript(`(() => {
    const q = (s) => !!document.querySelector(s)
    const tabs_ = document.querySelectorAll('.tab').length
    return {
      app: q('.app'), chrome: q('.chrome'), tabStrip: q('.tab-strip'), toolbar: q('.toolbar'),
      menuBtn: q('.menu-btn'), newTab: q('.new-tab'), tabCount: tabs_,
      bodyText: (document.body ? document.body.textContent : '').slice(0, 60)
    }
  })()`).catch((e) => 'ERR:' + e.message)

  // Pestañas (WebContentsView) registradas
  const wctx = ctx.windows.get(win)
  results.tabsInMain = wctx ? Array.from(wctx.tabs.keys()).map((k) => { const t = wctx.tabs.get(k); return { id: k, vis: (() => { try { return t.view.getVisible() } catch { return 'ERR' } })(), type: t.wc.getType(), url: t.wc.getURL() } }) : null

  // Abrir el menú (hamburguesa) y comprobar si se crea una VENTANA nativa
  await ui.executeJavaScript(`document.querySelector('.menu-btn').click(); true`).catch(() => {})
  await delay(1200)
  results.popupAfterMenu = popups.debugBounds()
  results.winsAfterMenu = BrowserWindow.getAllWindows().length
  results.menuIsWindow = !!popups.windowFor('toolbar-menu')

  // Cerrar y re-abrir para verificar el toggle
  await ui.executeJavaScript(`document.querySelector('.menu-btn').click(); true`).catch(() => {})
  await delay(700)
  results.popupAfter2ndClick = popups.debugBounds()

  // Comprobar si la página sigue visible con el menú abierto
  const vis = (() => { const t = tabs.getTab(wctx, Array.from(wctx.tabs.keys())[0]); return t ? (() => { try { return t.view.getVisible() } catch { return 'ERR' } })() : 'NOTAB' })()
  results.pageVisibleDuringMenu = vis

  console.log('DIAG:', JSON.stringify(results))
  win.close()
  setTimeout(() => app.exit(0), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
