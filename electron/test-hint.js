const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-hint-profile')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 20 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  await delay(5000)
  const toasts = await ui.executeJavaScript(`Array.from(document.querySelectorAll('.toast')).map(t => t.textContent)`).catch((e) => 'ERR:' + e.message)
  const hintSeen = await ui.executeJavaScript(`localStorage.getItem('nixer-drag-hint-v2')`).catch(() => 'ERR')
  console.log('HINT:', JSON.stringify({ toasts, hintSeen }))
  const ok = Array.isArray(toasts) && toasts.some((t) => t.indexOf('Consejo') !== -1)
  console.log('RESULT:', ok ? 'HINT_OK' : 'HINT_FAIL')
  win.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
