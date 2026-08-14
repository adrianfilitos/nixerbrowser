const { app, BrowserWindow, webContents } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-profiles-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const { app: a } = require('electron')
  if (process.env.DBG_PRE) {
    a.on('web-contents-created', (_e, wc) => {
      wc.on('console-message', (_ev, _l, m) => console.log('[WCC:' + wc.id + ']', m))
    })
  }
  const store = require('./store')
  store.upsertDownload({ id: 'd1', name: 'a.png', url: 'u1', path: 'x', received: 10, total: 10, state: 'completed', ts: Date.now() })
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  const waitTab = () => ui.executeJavaScript(`(async () => { for (let i = 0; i < 60; i++) { if (document.querySelector('.tab')) return true; await new Promise(r => setTimeout(r, 200)) } return false })()`)
  await waitTab()
  await delay(1200)
  await ui.executeJavaScript(`window.api.openPage('profiles')`)
  await delay(2000)
  const profWc = webContents.getAllWebContents().find((w) => w !== ui && w.getURL().startsWith('nixer://profiles'))
  const profRes = profWc ? await profWc.executeJavaScript(`(async () => {
    for (let i = 0; i < 30; i++) { const n = document.querySelectorAll('.profile').length; if (n > 0) return { rows: n, current: document.querySelector('.profile.current .info b') ? document.querySelector('.profile.current .info b').textContent : '' }; await new Promise(r => setTimeout(r, 200)) }
    return { rows: 0, current: '' }
  })()`) : 'NO_WC'
  console.log('PROFILES:', JSON.stringify(profRes))
  await ui.executeJavaScript(`window.api.openPage('downloads')`)
  await delay(2000)
  const dlWc = webContents.getAllWebContents().find((w) => w !== ui && w.getURL().startsWith('nixer://downloads'))
  if (dlWc) {
    const api = await dlWc.executeJavaScript(`({ hasAPI: typeof window.browserAPI !== 'undefined', href: location.href })`)
    console.log('PAGE_ENV:', JSON.stringify(api))
  }
  const dlPage = dlWc ? await dlWc.executeJavaScript(`(async () => {
    for (let i = 0; i < 30; i++) { const b = document.getElementById('clear'); if (b) { const rows = document.querySelectorAll('.row').length; b.click(); await new Promise(r => setTimeout(r, 800)); return { rowsBefore: rows, rowsAfter: document.querySelectorAll('.row').length, empty: !!document.querySelector('.empty') } } await new Promise(r => setTimeout(r, 200)) }
    return { rowsBefore: 0, rowsAfter: 0, empty: false, noBtn: true }
  })()`) : 'NO_WC'
  console.log('DLPAGE:', JSON.stringify(dlPage))
  win.close()
  const ok = dlPage && dlPage.rowsBefore === 1 && dlPage.rowsAfter === 0 && profRes && profRes.rows > 0
  console.log('RESULT:', ok ? 'DLPAGE_OK' : 'DLPAGE_FAIL')
  setTimeout(() => app.exit(0), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
