const { app, BrowserWindow, session } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const http = require('http')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-winopen-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  await delay(1500)
  await ui.executeJavaScript(`document.querySelector('.new-tab').click(); true`)
  await delay(1200)

  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html')
    res.end('<html><body><a id="bl" href="https://example.com/fromblank" target="_blank">blank</a><a id="bb" href="https://example.com/fromblock">bb</a></body></html>')
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port

  const openEvents = []
  const { webContents } = require('electron')
  const attachAll = () => { for (const w of webContents.getAllWebContents()) { if (!w.__listening) { w.__listening = true; w.on('ui-action', (_e, action, data) => { if (action === 'open-tab') openEvents.push(String(data)) }) } } }
  attachAll()
  webContents.getAllWebContents().forEach(() => {})

  const tabId = await ui.executeJavaScript(`document.querySelector('.tab').dataset.id`)
  const tabsBefore = await ui.executeJavaScript(`document.querySelectorAll('.tab').length`)
  await ui.executeJavaScript(`window.api.tabLoad('${tabId}', 'http://127.0.0.1:${port}/')`)
  await delay(3000)

  const winsBefore = BrowserWindow.getAllWindows().length

  const clickResult = await new Promise((resolve) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().includes('127.0.0.1:' + port))
    if (!wc) { resolve('NO_WC'); return }
    wc.executeJavaScript(`document.getElementById('bl').click(); true`).then(resolve)
  })
  await delay(1500)
  attachAll()

  const winsAfter = BrowserWindow.getAllWindows().length
  const tabsAfter = await ui.executeJavaScript(`document.querySelectorAll('.tab').length`)
  console.log('WINOPEN_RESULT:', JSON.stringify({ clickResult, openEvents, winsBefore, winsAfter, newWindows: winsAfter - winsBefore, tabsBefore, tabsAfter }))
  server.close()
  const ok = (openEvents.length > 0 || tabsAfter > tabsBefore) && winsAfter === winsBefore
  console.log('RESULT:', ok ? 'WINOPEN_OK' : 'WINOPEN_FAIL')
  win.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
