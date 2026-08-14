const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-dl-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const store = require('./store')
  const imgPath = path.join(__dirname, '..', 'build', 'icon.png')
  if (!fs.existsSync(imgPath)) { console.log('NO_ICON'); app.exit(2); return }
  store.upsertDownload({ id: 't1', name: 'foto-prueba.png', url: 'https://example.com/foto.png', path: imgPath, received: 1024, total: 2048, state: 'completed', ts: Date.now() })
  store.upsertDownload({ id: 't2', name: 'documento.pdf', url: 'https://example.com/doc.pdf', path: imgPath, received: 500, total: 1000, state: 'in-progress', ts: Date.now() })
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  const waitTab = () => ui.executeJavaScript(`(async () => { for (let i = 0; i < 60; i++) { const t = document.querySelector('.tab'); if (t) return true; await new Promise(r => setTimeout(r, 200)) } return false })()`)
  await waitTab()
  await delay(1200)
  await ui.executeJavaScript(`document.querySelector('.tool-btn[title^="Descargas"]').click(); true`)
  await delay(1500)
  const { webContents } = require('electron')
  const popupWc = webContents.getAllWebContents().find((w) => w !== ui && w.getURL().includes('popup.html'))
  const result = popupWc ? await popupWc.executeJavaScript(`(() => {
    const rows = Array.from(document.querySelectorAll('.row')).map(r => ({
      name: r.querySelector('.name') ? r.querySelector('.name').textContent : '',
      img: !!(r.querySelector('.thumb img'))
    }))
    const empty = !!document.querySelector('.empty')
    return { dd: true, rows, empty, head: (document.querySelector('.head span') || {}).textContent || '' }
  })()`) : { dd: false }
  console.log('DLS:', JSON.stringify(result))
  const ok = result.dd && result.rows.length === 2 && result.rows.some((r) => r.img)
  console.log('RESULT:', ok ? 'DL_OK' : 'DL_FAIL')
  win.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
