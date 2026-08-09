const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-ux-profile')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })

require('./main')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const wto = (p, ms, tag) => Promise.race([p, new Promise((r) => setTimeout(() => r('TIMEOUT:' + tag), ms))])

app.whenReady().then(async () => {
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
  const results = {}

  const api = await ui.executeJavaScript(`({ openNewTab: typeof window.api.openNewTab, openPage: typeof window.api.openPage, aiChat: typeof window.api.aiChat, createWindow2: window.api.createWindow.length })`)
  results.api = api

  async function typeInBar(text) {
    return await ui.executeJavaScript(`(async () => {
      const input = document.querySelector('.address-bar input')
      if (!input) return { noInput: true }
      input.focus()
      const setVal = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setVal.call(input, ${JSON.stringify(text)})
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 900))
      return Array.from(document.querySelectorAll('.suggestion')).map((x) => x.textContent)
    })()`)
  }

  results.calc = await typeInBar('2+2')
  results.conv = await typeInBar('10 km to mi')

  // calculadora/conversor presentan sugerencias con '='
  const calcOk = (results.calc || []).some((t) => t.indexOf('=') !== -1 && t.indexOf('4') !== -1)
  const convOk = (results.conv || []).some((t) => t.indexOf('6.21') !== -1 || t.indexOf('6.2') !== -1)

  // lector: botones de fuente
  for (let i = 0; i < 8; i++) {
    const has = await ui.executeJavaScript(`!!document.querySelector('webview.active')`).catch(() => false)
    if (has) break
    await delay(500)
  }
  await ui.executeJavaScript(`(() => { const wv = document.querySelector('webview.active'); if (wv) wv.loadURL('nixer://reader?id=1'); return true })()`)
  await delay(1800)
  results.reader = await wto(ui.executeJavaScript(`(async () => {
    const wv = document.querySelector('webview.active')
    return await wv.executeJavaScript(\`(function () { return { plus: !!document.getElementById('plus'), minus: !!document.getElementById('minus') } })()\`)
  })()`), 6000, 'reader')

  // contraseñas: generador
  await ui.executeJavaScript(`(() => { const wv = document.querySelector('webview.active'); if (wv) wv.loadURL('nixer://passwords'); return true })()`)
  await delay(1800)
  results.passGen = await wto(ui.executeJavaScript(`(async () => {
    const wv = document.querySelector('webview.active')
    return await wv.executeJavaScript(\`(function () { return !!document.getElementById('gen') })()\`)
  })()`), 6000, 'pass')

  // descargas: IPC open/show existen
  const dls = await wto(ui.executeJavaScript(`window.api.onDownloads ? 'have' : 'no'`), 3000, 'dl')
  results.dlIpc = dls

  normal.close()
  console.log('UX:', JSON.stringify({ results, errs }))
  const ok = api.openNewTab === 'function' && api.openPage === 'function' && calcOk && convOk &&
    !!(results.reader && results.reader.plus && results.reader.minus) && results.passGen === true && errs.length === 0
  console.log('RESULT:', ok ? 'UX_OK' : 'UX_FAIL')
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
