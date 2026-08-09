const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-leak-profile')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })

require('./main')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  await delay(4000)
  const win = BrowserWindow.getAllWindows()[0]
  const ui = win.webContents

  const before = await ui.executeJavaScript(`document.querySelectorAll('.tab').length`)

  for (let i = 0; i < 3; i++) {
    ui.send('ui-action', 'new-tab')
    await delay(400)
  }
  const afterNew = await ui.executeJavaScript(`document.querySelectorAll('.tab').length`)

  const beforeClose = afterNew
  ui.send('ui-action', 'close-tab')
  await delay(400)
  const afterClose = await ui.executeJavaScript(`document.querySelectorAll('.tab').length`)

  console.log('LEAK:', JSON.stringify({ before, afterNew, afterClose }))
  const ok = afterNew === before + 3 && afterClose === beforeClose - 1
  console.log('RESULT:', ok ? 'LEAK_OK' : 'LEAK_FAIL')
  app.exit(ok ? 0 : 1)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
