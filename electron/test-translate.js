const { app, BrowserWindow, session } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const http = require('http')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-translate-profile')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })

require('./main')
const translate = require('./translate')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  const results = {}

  // 1) Servicio de traducción
  const t = await translate.translateText('Hello world', 'es')
  results.service = t
  results.serviceOk = typeof t === 'string' && t.length > 0 && /hola/i.test(t)

  // 2) Traducción de una página real (in-place + barra)
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html')
    res.end('<html><body><h1>Welcome</h1><p>This is a test page with content.</p></body></html>')
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port

  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: false, contextIsolation: true, webviewTag: true } })
  win.loadURL('data:text/html,<webview id="wv" src="http://127.0.0.1:' + port + '/" style="width:100%;height:100%"></webview>')
  await delay(2500)
  const wv = await win.webContents.executeJavaScript(`document.getElementById('wv')`)
  const wc = wv.getWebContents ? wv.getWebContents() : null
  // translatePage espera un webContents; obtenemos el guest
  const guests = []
  win.webContents.on('did-attach-webview', (e, guest) => guests.push(guest))
  const wcId = await win.webContents.executeJavaScript(`document.getElementById('wv').getWebContentsId()`)
  const guest = require('electron').webContents.fromId(wcId)

  const okPage = await translate.translatePage(guest)
  await delay(2500)
  const pageState = await win.webContents.executeJavaScript(`(async () => {
    const wv = document.getElementById('wv')
    return await wv.executeJavaScript(\`(function(){ return { bar: !!document.getElementById('nixer-tbar'), h1: document.querySelector('h1') ? document.querySelector('h1').textContent : '' } })()\`)
  })()`)
  results.pageState = pageState
  results.pageOk = okPage === true && pageState.bar === true && pageState.h1.length > 0

  server.close()
  console.log('TRANSLATE:', JSON.stringify({ results, t, pageState }))
  const ok = results.serviceOk && results.pageOk
  console.log('RESULT:', ok ? 'TRANSLATE_OK' : 'TRANSLATE_FAIL')
  app.exit(ok ? 0 : 1)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
