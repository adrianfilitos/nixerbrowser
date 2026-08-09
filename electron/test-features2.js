const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-features2-profile')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })

require('./main')
const store = require('./store')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const wto = (p, ms, tag) => Promise.race([p, new Promise((r) => setTimeout(() => r('TIMEOUT:' + tag), ms))])

app.whenReady().then(async () => {
  store.addHistory({ url: 'https://hoy.example', title: 'Hoy', ts: Date.now() })
  store.addHistory({ url: 'https://ayer.example', title: 'Ayer', ts: Date.now() - 86400000 })
  store.addHistory({ url: 'https://viejo.example', title: 'Viejo', ts: Date.now() - 3 * 86400000 })

  let normal = null
  for (let i = 0; i < 20 && !normal; i++) {
    const ws = BrowserWindow.getAllWindows()
    if (ws.length) normal = ws[0]
    else await delay(500)
  }
  const ui = normal.webContents
  const errs = []
  ui.on('console-message', (_e, level, message) => { if (level >= 3) errs.push(String(message)) })
  for (let i = 0; i < 8; i++) {
    const has = await ui.executeJavaScript(`!!document.querySelector('webview.active')`).catch(() => false)
    if (has) break
    await delay(500)
  }

  async function loadAndProbe(url, expr) {
    await ui.executeJavaScript(`(() => { const wv = document.querySelector('webview.active'); if (wv) wv.loadURL(${JSON.stringify(url)}); return true })()`)
    await delay(1800)
    return wto(ui.executeJavaScript(`(async () => {
      const wv = document.querySelector('webview.active')
      return await wv.executeJavaScript(${JSON.stringify('(' + expr + ')')})
    })()`), 6000, url)
  }

  const version = await loadAndProbe('nixer://version', `(function(){ return { h1: document.querySelector('h1') ? document.querySelector('h1').textContent : null, rows: document.querySelectorAll('.row').length } })()`)
  const qr = await loadAndProbe('nixer://qr?url=https://example.com', `(function(){ return { url: document.getElementById('url').textContent, hasImg: !!document.getElementById('qr') } })()`)
  const hist = await loadAndProbe('nixer://history', `(function(){ return { days: document.querySelectorAll('.day').length, hoy: !!Array.from(document.querySelectorAll('.day-head')).find(function(h){ return h.textContent.indexOf('Hoy') !== -1 }) } })()`)

  console.log('FEATURES2:', JSON.stringify({ version, qr, hist, errs }))
  const ok = version.h1 === 'Nixer Browser' && version.rows > 0 &&
    qr.url === 'https://example.com' && qr.hasImg === true &&
    hist.days >= 2 && hist.hoy === true && errs.length === 0
  console.log('RESULT:', ok ? 'FEATURES2_OK' : 'FEATURES2_FAIL')
  normal.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
