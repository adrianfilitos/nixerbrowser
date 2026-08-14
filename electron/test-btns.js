const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const http = require('http')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-btns-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  const waitTab = () => ui.executeJavaScript(`(async () => { for (let i = 0; i < 60; i++) { const t = document.querySelector('.tab'); if (t && t.dataset.id) return t.dataset.id; await new Promise(r => setTimeout(r, 200)) } return null })()`)
  const tabId = await waitTab()
  if (!tabId) { console.log('NO_TAB'); app.exit(2); return }
  await delay(1000)
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<html><body><h1>REALPAGE</h1></body></html>') })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  await ui.executeJavaScript(`window.api.tabLoad('${tabId}', 'http://127.0.0.1:${port}/')`)
  await delay(2500)

  const results = {}
  const btns = ['menu-btn', 'tool-btn', 'ai-tool-btn', 'tv-btn']
  for (const sel of btns) {
    const info = await ui.executeJavaScript(`(() => { const el = document.querySelector('.${sel}'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), cls: el.className } })()`)
    if (!info) { results[sel] = 'NO_BTN'; continue }
    ui.sendInputEvent({ type: 'mouseDown', x: info.x, y: info.y, button: 'left', clickCount: 1 })
    ui.sendInputEvent({ type: 'mouseUp', x: info.x, y: info.y, button: 'left', clickCount: 1 })
    await delay(500)
    const url = await ui.executeJavaScript(`window.api.tabGetUrl('${tabId}')`)
    const tabs = await ui.executeJavaScript(`document.querySelectorAll('.tab').length`)
    const dd = await ui.executeJavaScript(`!!document.querySelector('.dropdown')`)
    results[sel] = { url: url.split('127.0.0.1')[0] + (url.includes('127.0.0.1') ? 'LOCAL' : url), tabs, dd }
    await ui.executeJavaScript(`document.body.click(); true`)
    await delay(300)
  }
  console.log('BTNS:', JSON.stringify(results))
  server.close()
  win.close()
  setTimeout(() => app.exit(0), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
