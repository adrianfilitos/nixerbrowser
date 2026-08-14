const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const http = require('http')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-tm-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const popups = require('./popups')
const ctx = require('./ctx')
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
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<html><body><h1>P</h1></body></html>') })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  await ui.executeJavaScript(`window.api.tabLoad('${tabId}', 'http://127.0.0.1:${port}/')`)
  await delay(2000)

  const results = {}
  const tmList = await ui.executeJavaScript(`window.api.taskManagerList()`).catch((e) => ({ err: e.message }))
  results.tmListRows = Array.isArray(tmList.rows) ? tmList.rows.length : -1

  ctx.sendUi(wctx, 'open-taskmanager')
  const trace = []
  for (let i = 0; i < 12; i++) {
    await delay(500)
    trace.push(popups.debugBounds().map((p) => p.key).join(','))
  }
  results.trace = trace
  results.tmOpen = popups.debugBounds().some((p) => p.key === 'taskmanager-popup')
  results.tmBounds = popups.debugBounds()
  const pw = popups.windowFor('taskmanager-popup')
  results.tmHasWindow = !!pw
  if (pw) {
    results.tmDom = await pw.webContents.executeJavaScript(`(() => {
      const rows = document.querySelectorAll('.row').length
      const empty = !!document.querySelector('.empty')
      const names = Array.from(document.querySelectorAll('.name')).map(n => n.textContent).slice(0,3)
      return { rows, empty, names, html: document.getElementById('root') ? document.getElementById('root').innerHTML.slice(0,120) : '' }
    })()`).catch((e) => 'ERR:' + e.message)
  }

  console.log('TM:', JSON.stringify(results))
  win.close()
  setTimeout(() => app.exit(0), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
