const { app, BrowserWindow, webContents } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const http = require('http')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-drag-load-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  const waitTab = (n) => ui.executeJavaScript(`(async () => { for (let i = 0; i < 60; i++) { if (document.querySelectorAll('.tab').length >= ${n}) return true; await new Promise(r => setTimeout(r, 200)) } return false })()`)
  await waitTab(1)
  await ui.executeJavaScript(`document.querySelector('.new-tab').click(); true`)
  await waitTab(2)
  await ui.executeJavaScript(`document.querySelector('.new-tab').click(); true`)
  await waitTab(3)
  await delay(800)
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<html><body><h1>' + req.url + '</h1></body></html>') })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const tabIds = await ui.executeJavaScript(`Array.from(document.querySelectorAll('.tab')).map(t => t.dataset.id)`)
  for (const id of tabIds) {
    await ui.executeJavaScript(`window.api.tabLoad('${id}', 'http://127.0.0.1:${port}/t${id}')`)
  }
  await delay(3000)
  const tabWc = webContents.getAllWebContents().find((w) => w.getType() === 'window' && w !== ui && w.getURL().includes('127.0.0.1'))
  console.log('TAB_WC:', tabWc ? tabWc.id : 'none', tabWc ? tabWc.getURL() : '')
  let loads = 0
  tabWc.on('did-start-loading', () => { loads++; console.log('[nav] did-start-loading -> ' + tabWc.getURL()) })
  tabWc.on('did-navigate', (_e, url) => { console.log('[nav] did-navigate -> ' + url) })

  const rects = await ui.executeJavaScript(`Array.from(document.querySelectorAll('.tab')).slice(0,3).map(t => { const r = t.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) } })`)
  const from = rects[0], to = rects[2]
  const t0 = Date.now()
  ui.sendInputEvent({ type: 'mouseDown', x: from.x, y: from.y, button: 'left', clickCount: 1 })
  for (let i = 1; i <= 30; i++) {
    ui.sendInputEvent({ type: 'mouseMove', x: Math.round(from.x + (to.x - from.x) * (i / 30)), y: from.y, button: 'left', buttons: 1, movementX: 2, movementY: 0 })
    await delay(16)
  }
  await delay(200)
  ui.sendInputEvent({ type: 'mouseUp', x: to.x, y: to.y, button: 'left', clickCount: 1 })
  await delay(800)
  const dt = Date.now() - t0
  const urlAfter = tabWc.getURL()
  const orderEnd = await ui.executeJavaScript(`Array.from(document.querySelectorAll('.tab-list .tab')).map(t => t.dataset.id)`)
  console.log('DRAG_LOAD:', JSON.stringify({ loads, dt, urlAfter: urlAfter.split('127.0.0.1')[0] + (urlAfter.includes('127.0.0.1') ? 'LOCAL' : urlAfter), orderEnd }))
  server.close()
  win.close()
  setTimeout(() => app.exit(0), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
