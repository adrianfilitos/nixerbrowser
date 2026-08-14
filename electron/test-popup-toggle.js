const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const http = require('http')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-popup-toggle-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const popups = require('./popups')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  await delay(1500)

  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<html><body style="background:#f00"><h1>PAGE</h1></body></html>') })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const tabId = await ui.executeJavaScript(`(async () => { for (let i = 0; i < 60; i++) { const t = document.querySelector('.tab'); if (t && t.dataset.id) return t.dataset.id; await new Promise(r => setTimeout(r, 200)) } return null })()`)
  await ui.executeJavaScript(`window.api.tabLoad('${tabId}', 'http://127.0.0.1:${port}/')`)
  await delay(2500)

  const results = {}
  const nt = () => popups.debugBounds().filter((p) => p.key !== 'toasts-popup').length
  const btnInfo = await ui.executeJavaScript(`(() => {
    const b = document.querySelector('.profile-avatar')
    if (!b) return null
    const r = b.getBoundingClientRect()
    return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }
  })()`)
  if (!btnInfo) { console.log('NO_BTN'); app.exit(2); return }

  await ui.executeJavaScript(`document.elementFromPoint(${btnInfo.x}, ${btnInfo.y}).click(); true`)
  await delay(600)
  results.openAfter1 = nt() === 1

  await ui.executeJavaScript(`document.elementFromPoint(${btnInfo.x}, ${btnInfo.y}).click(); true`)
  await delay(600)
  results.closedOrJustClosed = nt() === 0

  await ui.executeJavaScript(`document.elementFromPoint(${btnInfo.x}, ${btnInfo.y}).click(); true`)
  await delay(600)
  results.opensAgain = nt() === 1

  console.log('POPUP_TOGGLE:', JSON.stringify(results))
  const ok = results.openAfter1 === true && results.closedOrJustClosed === true && results.opensAgain === true
  console.log('RESULT:', ok ? 'POPUP_TOGGLE_OK' : 'POPUP_TOGGLE_FAIL')
  server.close()
  win.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
