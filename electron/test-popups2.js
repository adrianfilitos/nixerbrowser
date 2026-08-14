const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const http = require('http')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-popups2-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const popups = require('./popups')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  await delay(1500)
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<html><body><h1>P</h1></body></html>') })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const tabId = await ui.executeJavaScript(`(async () => { for (let i = 0; i < 60; i++) { const t = document.querySelector('.tab'); if (t && t.dataset.id) return t.dataset.id; await new Promise(r => setTimeout(r, 200)) } return null })()`)
  await ui.executeJavaScript(`window.api.tabLoad('${tabId}', 'http://127.0.0.1:${port}/')`)
  await delay(2000)

  const results = {}
  const nt = () => popups.debugBounds().filter((p) => p.key !== 'toasts-popup').length
  const clickBtn = (sel) => ui.executeJavaScript(`(async () => {
    for (let i = 0; i < 40; i++) { const b = document.querySelector('${sel}'); if (b) { b.click(); return true } await new Promise(r => setTimeout(r, 150)) }
    return false
  })()`)
  const clickReal = (sel) => ui.executeJavaScript(`(async () => {
    for (let i = 0; i < 40; i++) { const b = document.querySelector('${sel}'); if (b) {
      const r = b.getBoundingClientRect(); const el = document.elementFromPoint(Math.round(r.x + r.width/2), Math.round(r.y + r.height/2))
      for (const type of ['mousedown', 'mouseup', 'click']) el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }))
      return true
    } await new Promise(r => setTimeout(r, 150)) }
    return false
  })()`)

  // Marcador: abrir -> cerrar -> reabrir
  const bmOpen = await clickReal('.tool-btn[title*="marcadores"], .tool-btn[title*="Añadir a marcadores"]')
  await delay(700)
  results.bmOpen = popups.debugBounds().some((p) => p.key === 'bookmark-popup')
  await clickReal('.tool-btn[title*="marcadores"], .tool-btn[title*="Añadir a marcadores"]')
  await delay(600)
  results.bmClosed = nt() === 0

  // Manejar pestañas: abrir -> cerrar -> reabrir
  await clickReal('.tab-manage')
  await (async () => { for (let i = 0; i < 25 && !popups.debugBounds().some((p) => p.key === 'tab-manage'); i++) await delay(150) })()
  results.tmOpen = popups.debugBounds().some((p) => p.key === 'tab-manage')
  await clickReal('.tab-manage')
  await delay(600)
  results.tmClosed = nt() === 0
  await clickReal('.tab-manage')
  await delay(700)
  results.tmReopens = popups.debugBounds().some((p) => p.key === 'tab-manage')
  await ui.executeJavaScript(`window.api.hidePopup ? (window.api.hidePopup('tab-manage'), true) : true`)
  await delay(600)

  // Descargas: abrir -> cerrar
  await clickReal('.tool-btn[title*="Descargas"]')
  await delay(700)
  results.dlOpen = popups.debugBounds().some((p) => p.key === 'downloads-popup')
  await clickReal('.tool-btn[title*="Descargas"]')
  await delay(600)
  results.dlClosed = nt() === 0

  console.log('POPUPS2:', JSON.stringify(results))
  const ok = results.bmOpen && results.bmClosed && results.tmOpen && results.tmClosed && results.tmReopens && results.dlOpen && results.dlClosed
  console.log('RESULT:', ok ? 'POPUPS2_OK' : 'POPUPS2_FAIL')
  server.close()
  win.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
