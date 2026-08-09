const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const http = require('http')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-security-profile')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })

require('./main')
const store = require('./store')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

function dbRaw() {
  const base = process.env.NIXER_USER_DATA
  let raw = ''
  for (const f of ['nixer.db', 'nixer.db-wal']) {
    try { raw += fs.readFileSync(path.join(base, f), 'utf8') } catch {}
  }
  return raw
}

app.whenReady().then(async () => {
  const results = {}

  // 1) Passwords cifradas en reposo
  const PASS = 'clave-super-secreta-123'
  store.addPassword({ origin: 'https://example.com', username: 'pepe', password: PASS })
  const pwRaw = dbRaw()
  results.passwordEncryptedAtRest = !pwRaw.includes(PASS)
  results.passwordDecrypts = store.getPassword('https://example.com').password === PASS

  // 2) Clave de IA cifrada en reposo
  const AIKEY = 'sk-ia-secreta-999'
  store.setSettings({ aiApiKey: store.encryptSecret(AIKEY) })
  const stRaw = dbRaw()
  results.aiKeyEncryptedAtRest = !stRaw.includes(AIKEY)
  results.aiKeyDecrypts = store.decryptSecret(store.settings().aiApiKey) === AIKEY

  await delay(4000)
  const win = BrowserWindow.getAllWindows()[0]
  const ui = win.webContents

  // 3) browserAPI NO expuesto en páginas externas
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<html><body><h1>ext</h1></body></html>') })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  await ui.executeJavaScript(`(() => { const wv = document.querySelector('webview.active'); if (wv) wv.loadURL('http://127.0.0.1:${port}/'); return true })()`)
  await delay(2500)
  const ext = await ui.executeJavaScript(`(async () => {
    const wv = document.querySelector('webview.active')
    return await wv.executeJavaScript('typeof window.browserAPI')
  })()`)
  results.externalNoBrowserAPI = ext === 'undefined'

  // 4) browserAPI SÍ en páginas internas
  await ui.executeJavaScript(`(() => { const wv = document.querySelector('webview.active'); if (wv) wv.loadURL('nixer://settings'); return true })()`)
  await delay(2500)
  const int = await ui.executeJavaScript(`(async () => {
    const wv = document.querySelector('webview.active')
    return await wv.executeJavaScript('typeof window.browserAPI')
  })()`)
  results.internalHasBrowserAPI = int === 'object'

  // 5) Guard de navegación: no se puede ir a file:// desde página externa
  const nav = await ui.executeJavaScript(`(async () => {
    const wv = document.querySelector('webview.active')
    if (!wv) return null
    wv.loadURL('http://127.0.0.1:${port}/')
    await new Promise((r) => setTimeout(r, 1500))
    await wv.executeJavaScript("location.href = 'file:///C:/Windows/win.ini'; true")
    await new Promise((r) => setTimeout(r, 1500))
    return wv.getURL()
  })()`)
  results.fileNavBlocked = typeof nav === 'string' && nav.indexOf('http://127.0.0.1') === 0 && !nav.startsWith('file:')

  server.close()

  console.log('SECURITY:', JSON.stringify(results))
  const ok = results.passwordEncryptedAtRest && results.passwordDecrypts &&
    results.aiKeyEncryptedAtRest && results.aiKeyDecrypts &&
    results.externalNoBrowserAPI && results.internalHasBrowserAPI && results.fileNavBlocked
  console.log('RESULT:', ok ? 'SECURITY_OK' : 'SECURITY_FAIL')
  app.exit(ok ? 0 : 1)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
