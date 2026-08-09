const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const http = require('http')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-incognito-profile')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })

require('./main')
const store = require('./store')

process.on('uncaughtException', (err) => { console.log('MAIN_UNCAUGHT:', err && err.stack) })
process.on('unhandledRejection', (reason) => { console.log('MAIN_REJECTION:', reason && reason.message) })
process.on('exit', (code) => console.log('PROCESS_EXIT', code))

const delay = (ms) => new Promise((r) => setTimeout(r, ms))
let watchdog = setTimeout(() => { console.log('WATCHDOG_FIRE'); app.exit(9) }, 25000)

async function withTimeout(p, ms, label) {
  const r = await Promise.race([p, new Promise((res) => setTimeout(() => res('TIMEOUT:' + label), ms))])
  console.log('QUERY', label, '->', JSON.stringify(r).slice(0, 300))
  return r
}

app.whenReady().then(async () => {
  let normal = null
  for (let i = 0; i < 20 && !normal; i++) {
    const ws = BrowserWindow.getAllWindows()
    if (ws.length) normal = ws[0]
    else await delay(500)
  }
  console.log('STEP1 normal ok')
  await normal.webContents.executeJavaScript(`window.api.createWindow(true); true`)
  console.log('STEP2 incognito requested')
  await delay(4000)
  console.log('STEP3 waited')

  let inc = null
  for (const w of BrowserWindow.getAllWindows()) {
    let info = null
    try { info = await w.webContents.executeJavaScript('window.api.windowInfo()') } catch (e) { console.log('INFO_ERR', e.message) }
    if (info && info.incognito) inc = w
  }
  if (!inc) { console.log('NO_INC'); app.exit(1); return }
  console.log('STEP4 found incognito url=' + inc.webContents.getURL())

  const ui = inc.webContents
  const errs = []
  ui.on('console-message', (_e, level, message) => { if (level >= 3) errs.push(String(message)) })

  const wvState = await withTimeout(
    ui.executeJavaScript(`(async () => {
      const wv = document.querySelector('webview.active')
      if (!wv) return { noWv: true }
      let title = null
      try { title = await wv.executeJavaScript('document.title') } catch (e) { title = 'ERR:' + e.message }
      return { url: wv.getURL(), loading: wv.isLoading(), title, badge: !!document.querySelector('.incognito-chip') }
    })()`),
    8000,
    'wvstate'
  )
  console.log('STEP5 wvstate done')
  const results = {
    schemeOk: typeof wvState === 'object' && typeof wvState.url === 'string' && wvState.url.indexOf('nixer://') === 0 && typeof wvState.title === 'string' && wvState.title.length > 0,
    badge: typeof wvState === 'object' && wvState.badge === true,
  }

  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<html><body><h1>t</h1></body></html>') })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  console.log('STEP6 server ok')
  await withTimeout(
    ui.executeJavaScript(`(() => { const wv = document.querySelector('webview.active'); wv.loadURL('http://127.0.0.1:${port}/'); return true })()`),
    4000,
    'loadurl'
  )
  await delay(2500)
  results.noHistoryInIncognito = store.listHistory().length === 0
  results.sessionEmpty = store.session().length === 0
  console.log('STEP7 done')

  clearTimeout(watchdog)
  console.log('INCOGNITO:', JSON.stringify({ wvState, results, errs }))
  const ok = results.schemeOk && results.badge && results.noHistoryInIncognito && results.sessionEmpty && errs.length === 0
  console.log('RESULT:', ok ? 'INCOGNITO_OK' : 'INCOGNITO_FAIL')
  server.close()
  normal.close()
  inc.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
