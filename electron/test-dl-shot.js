const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-dl-shot')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const popups = require('./popups')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const store = require('./store')
  const imgPath = path.join(__dirname, '..', 'build', 'icon.png')
  if (!fs.existsSync(imgPath)) { console.log('NO_ICON'); app.exit(2); return }
  store.upsertDownload({ id: 't1', name: 'foto-prueba.png', url: 'https://example.com/foto.png', path: imgPath, received: 1024, total: 2048, state: 'completed', ts: Date.now() })
  store.upsertDownload({ id: 't2', name: 'documento-muy-largo-nombre-para-probar-ellipsis.pdf', url: 'https://example.com/doc.pdf', path: imgPath, received: 500, total: 1000, state: 'in-progress', ts: Date.now() })
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  const waitTab = () => ui.executeJavaScript(`(async () => { for (let i = 0; i < 60; i++) { const t = document.querySelector('.tab'); if (t) return true; await new Promise(r => setTimeout(r, 200)) } return false })()`)
  await waitTab()
  await delay(1200)
  await ui.executeJavaScript(`document.querySelector('.tool-btn[title^="Descargas"]').click(); true`)
  await delay(1500)
  const pw = popups.windowFor('downloads-popup')
  if (!pw) { console.log('NO_POPUP'); app.exit(2); return }
  const img = await pw.webContents.capturePage()
  const out = path.join(os.tmpdir(), 'dl-popup.png')
  fs.writeFileSync(out, img.toPNG())
  console.log('SHOT:', out)
  const metrics = await pw.webContents.executeJavaScript(`(() => {
    const rows = Array.from(document.querySelectorAll('.row')).map(r => ({ name: r.querySelector('.name').textContent, w: Math.round(r.getBoundingClientRect().width), h: Math.round(r.getBoundingClientRect().height), meta: (r.querySelector('.meta')||{}).textContent || '' }))
    return JSON.stringify(rows)
  })()`).catch((e) => 'ERR:' + e.message)
  console.log('ROWS:', metrics)
  win.close()
  setTimeout(() => app.exit(0), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
