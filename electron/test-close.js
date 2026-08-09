const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-close-profile')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })

require('./main')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  await delay(4500)
  const win = BrowserWindow.getAllWindows()[0]
  const ui = win.webContents
  const logs = []
  ui.on('console-message', (_e, level, message) => {
    logs.push('[' + level + '] ' + message)
    if (level >= 3) console.log('UI_ERR[' + level + ']:', message)
  })
  ui.on('render-process-gone', (_e, d) => console.log('UI_GONE:', JSON.stringify(d)))
  ui.on('preload-error', (_e, p, err) => console.log('PRELOAD_ERR:', p, err))
  process.on('uncaughtException', (err) => console.log('MAIN_UNCAUGHT:', err && err.stack))

  for (let i = 0; i < 3; i++) {
    await ui.executeJavaScript(`document.querySelector('.new-tab').click(); true`)
    await delay(800)
  }
  console.log('TABS_OPENED:', await ui.executeJavaScript(`document.querySelectorAll('.tab').length`))

  for (let i = 0; i < 3; i++) {
    await ui.executeJavaScript(`document.querySelectorAll('.tab .tab-close')[0].click(); true`)
    await delay(700)
  }
  console.log('TABS_AFTER_CLOSE:', await ui.executeJavaScript(`document.querySelectorAll('.tab').length`))

  await ui.executeJavaScript(`window.api.close(); true`)
  await delay(2000)
  console.log('CLOSE_WINDOW_OK errors:', logs.filter((l) => l.startsWith('[3]')).join(' | ') || 'NONE')
  app.exit(0)
}).catch((e) => { console.log('ERR', e && e.message); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 60000)
