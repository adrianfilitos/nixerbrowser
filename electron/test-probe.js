const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-probe-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const popups = require('./popups')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  ui.on('console-message', (_e, _l, msg) => console.log('[UI]', msg))
  await delay(3000)
  const pre = await ui.executeJavaScript(`({ sp: typeof window.api.showPopup, hp: typeof window.api.hidePopup })`).catch((e) => 'ERR:' + e.message)
  await ui.executeJavaScript(`(() => { const b = document.querySelector('.menu-btn'); const r = b.getBoundingClientRect(); const el = document.elementFromPoint(Math.round(r.x + r.width/2), Math.round(r.y + r.height/2)); for (const t of ['mousedown','mouseup','click']) el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window })); return true })()`).catch((e) => console.log('CLICK_ERR', e.message))
  await delay(1500)
  console.log('PROBE:', JSON.stringify({ pre, count: popups.count(), bounds: popups.debugBounds(), wins: BrowserWindow.getAllWindows().length }))
  win.close()
  setTimeout(() => app.exit(0), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
