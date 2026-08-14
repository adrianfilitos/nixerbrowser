const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const http = require('http')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-beforeunload-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  const tabs = require('./tabs')
  const ctxm = require('./ctx')
  const wctx = ctxm.windows.get(win)
  const uiEvents = []
  ui.on('tab-event', (_e, ev) => uiEvents.push(ev.type))

  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html')
    res.end('<html><body><h1>page</h1><script>window.addEventListener("beforeunload", function (e) { e.preventDefault(); e.returnValue = "x" })</script></body></html>')
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const url = 'http://127.0.0.1:' + port + '/'

  const results = {}

  // 1) Página con beforeunload: cancelar (response 0) => la pestaña NO se cierra
  const id1 = 'bu1'
  tabs.createTab(wctx, { id: id1, src: url })
  await delay(1500)
  tabs.setCloseConfirmOverride(async () => 0)
  tabs.closeTab(wctx, id1)
  await delay(800)
  results.cancelKeepsTab = !!tabs.getTab(wctx, id1)

  // 2) Página con beforeunload: confirmar (response 1) => se cierra
  const id2 = 'bu2'
  tabs.createTab(wctx, { id: id2, src: url })
  await delay(1500)
  tabs.setCloseConfirmOverride(async () => 1)
  tabs.closeTab(wctx, id2)
  await delay(800)
  results.confirmClosesTab = !tabs.getTab(wctx, id2)

  // 3) Página sin beforeunload: cierra directo (sin invocar el override)
  let overrideCalls = 0
  tabs.setCloseConfirmOverride(async () => { overrideCalls++; return 1 })
  const id3 = 'bu3'
  const server2 = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<html>plain</html>') })
  await new Promise((r) => server2.listen(0, '127.0.0.1', r))
  tabs.createTab(wctx, { id: id3, src: 'http://127.0.0.1:' + server2.address().port + '/' })
  await delay(1500)
  tabs.closeTab(wctx, id3)
  await delay(800)
  results.plainClosesDirect = !tabs.getTab(wctx, id3)
  results.overrideNotCalledForPlain = overrideCalls === 0

  // 4) forceCloseTab cierra aunque tenga beforeunload
  const id4 = 'bu4'
  tabs.createTab(wctx, { id: id4, src: url })
  await delay(1500)
  tabs.forceCloseTab(wctx, id4)
  await delay(800)
  results.forceCloses = !tabs.getTab(wctx, id4)

  tabs.setCloseConfirmOverride(null)
  server.close()
  server2.close()
  console.log('BEFOREUNLOAD:', JSON.stringify(results))
  const ok = results.cancelKeepsTab && results.confirmClosesTab && results.plainClosesDirect && results.overrideNotCalledForPlain && results.forceCloses
  console.log('RESULT:', ok ? 'BEFOREUNLOAD_OK' : 'BEFOREUNLOAD_FAIL')
  win.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 60000)
