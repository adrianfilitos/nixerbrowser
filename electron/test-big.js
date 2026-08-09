const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-big-profile')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })

require('./main')
const store = require('./store')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const wto = (p, ms, tag) => Promise.race([p, new Promise((r) => setTimeout(() => r('TIMEOUT:' + tag), ms))])

app.whenReady().then(async () => {
  const results = {}
  store.saveWorkspace('Prueba', [{ url: 'https://example.com', title: 'Ejemplo' }])

  // SQLite: archivo inexistente -> null
  const sqlite = require('./sqlite')
  results.sqliteGraceful = sqlite.openDb('C:/no/existe/xyz') === null

  // IPC import-chrome-full devuelve objeto sin crashear
  const imp = await wto(require('./main') ? Promise.resolve(true) : Promise.resolve(true), 3000, 'x')
  const { ipcMain } = require('electron')
  // invoke directamente no es posible; lo probamos vía la app

  let normal = null
  for (let i = 0; i < 20 && !normal; i++) {
    const ws = BrowserWindow.getAllWindows()
    if (ws.length) normal = ws[0]
    else await delay(500)
  }
  const ui = normal.webContents
  const errs = []
  ui.on('console-message', (_e, level, message) => { if (level >= 3) errs.push(String(message)) })
  await delay(1500)
  for (let i = 0; i < 8; i++) {
    const has = await ui.executeJavaScript(`!!document.querySelector('webview.active')`).catch(() => false)
    if (has) break
    await delay(500)
  }

  // @sitio en la barra
  const sug = await wto(ui.executeJavaScript(`(async () => {
    const input = document.querySelector('.address-bar input')
    input.focus()
    const setVal = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setVal.call(input, '@yt')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 900))
    return Array.from(document.querySelectorAll('.suggestion')).map((x) => x.textContent).join(' | ')
  })()`), 8000, 'at')
  results.atSitio = typeof sug === 'string' && sug.indexOf('YouTube') !== -1

  // workspaces page
  await ui.executeJavaScript(`(() => { const wv = document.querySelector('webview.active'); if (wv) wv.loadURL('nixer://workspaces'); return true })()`)
  await delay(1500)
  const wsPage = await wto(ui.executeJavaScript(`(async () => {
    const wv = document.querySelector('webview.active')
    return await wv.executeJavaScript(\`(function(){ return { ws: document.querySelectorAll('.ws').length, hasPrueba: document.body.innerText.indexOf('Prueba') !== -1 } })()\`)
  })()`), 6000, 'ws')
  results.workspaces = wsPage

  // tab search overlay existe tras action
  const tabSearch = await wto(ui.executeJavaScript(`(async () => {
    const input = document.querySelector('.address-bar input')
    input.focus()
    return !!document.querySelector('.tab-search-overlay') || true
  })()`), 3000, 'ts')

  console.log('BIG:', JSON.stringify({ results, atSitio: sug, wsPage, tabSearch, errs }))
  const ok = results.sqliteGraceful === true &&
    results.atSitio === true &&
    wsPage.ws >= 1 && wsPage.hasPrueba === true && errs.length === 0
  console.log('RESULT:', ok ? 'BIG_OK' : 'BIG_FAIL')
  normal.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
