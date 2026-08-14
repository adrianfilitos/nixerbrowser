const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const http = require('http')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-notif-perm-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const popups = require('./popups')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  const waitTab = () => ui.executeJavaScript(`(async () => { for (let i = 0; i < 60; i++) { const t = document.querySelector('.tab'); if (t && t.dataset.id) return t.dataset.id; await new Promise(r => setTimeout(r, 200)) } return null })()`)
  const tabId = await waitTab()
  if (!tabId) { console.log('NO_TAB'); app.exit(2); return }
  await delay(1000)
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<html><body><script>setTimeout(() => { Notification.requestPermission() }, 400)</script></body></html>') })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  await ui.executeJavaScript(`window.api.tabLoad('${tabId}', 'http://127.0.0.1:${port}/')`)
  const opened = await (async () => {
    for (let i = 0; i < 40; i++) {
      const d = popups.debugBounds()
      if (d.some((p) => p.key === 'permission-popup')) return true
      await delay(200)
    }
    return false
  })()
  console.log('NOTIF_PERM:', JSON.stringify({ opened, bounds: popups.debugBounds() }))
  server.close()
  win.close()
  setTimeout(() => app.exit(opened ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
