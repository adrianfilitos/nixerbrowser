const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-focus-profile')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const wto = (p, ms, tag) => Promise.race([p, new Promise((r) => setTimeout(() => r('TIMEOUT:' + tag), ms))])

app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 20 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  await delay(1500)

  const checkFocus = () => ui.executeJavaScript(`(() => {
    const a = document.activeElement
    const input = document.querySelector('.bar-input input')
    return { focused: a === input, cls: a && a.className && a.className.baseVal !== undefined ? a.className.baseVal : (a && a.className) }
  })()`)

  // foco por botón +
  await ui.executeJavaScript(`document.querySelector('.new-tab').click(); true`)
  await delay(800)
  const viaBtn = await wto(checkFocus(), 4000, 'btn')

  // foco por atajo Ctrl+T (action new-tab)
  ui.send('ui-action', 'new-tab')
  await delay(800)
  const viaKey = await wto(checkFocus(), 4000, 'key')

  // abrir pestaña con URL no debe robar el foco de la barra
  await ui.executeJavaScript(`document.activeElement.blur && document.activeElement.blur(); true`)
  await delay(300)
  await ui.executeJavaScript(`window.api.openNewTab('https://example.com'); true`)
  await delay(1200)
  const viaUrl = await wto(checkFocus(), 4000, 'url')

  console.log('FOCUS:', JSON.stringify({ viaBtn, viaKey, viaUrl }))
  const ok = viaBtn.focused === true && viaKey.focused === true && viaUrl.focused === false
  console.log('RESULT:', ok ? 'FOCUS_OK' : 'FOCUS_FAIL')
  win.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
