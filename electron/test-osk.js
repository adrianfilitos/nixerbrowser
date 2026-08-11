const { app, ipcMain, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-osk-profile')
process.env.NIXER_OSK_MOCK = '1'
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
const store = require('./store')
require('./main')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 20 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  await delay(4500)

  const oskPath = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'osk.exe')
  const results = {
    oskExists: fs.existsSync(oskPath),
    focusChannel: ipcMain.listenerCount('tv:input-focus') >= 1,
    blurChannel: ipcMain.listenerCount('tv:input-blur') >= 1,
  }

  results.tvFns = await ui.executeJavaScript("typeof window.api.tvInputFocus + '/' + typeof window.api.tvInputBlur").catch(() => 'ERR')
  results.openResult = await ui.executeJavaScript('window.api.oskOpen()').catch((e) => 'ERR:' + e.message)

  await ui.executeJavaScript(`window.__status = 'none'; window.api.onOskStatus((open) => { window.__status = String(open) }); 'subscribed'`)

  store.setSettings({ tvMode: false })
  ipcMain.emit('tv:input-focus', {})
  await delay(300)
  results.gateOff = await ui.executeJavaScript('window.__status')

  store.setSettings({ tvMode: true })
  results.tvModeValue = store.settings().tvMode
  ipcMain.emit('tv:input-focus', {})
  await delay(300)
  results.gateOn = await ui.executeJavaScript('window.__status')

  results.blurEmitReturn = ipcMain.emit('tv:input-blur', {})
  results.afterBlur1 = await ui.executeJavaScript('window.__status')
  await delay(1500)
  results.afterBlur2 = await ui.executeJavaScript('window.__status')
  await delay(1800)
  results.autoClose = await ui.executeJavaScript('window.__status')

  console.log('OSK:', JSON.stringify(results))
  const ok = results.oskExists && results.focusChannel && results.blurChannel
    && results.tvFns === 'function/function'
    && results.openResult && results.openResult.ok === true
    && results.gateOff === 'none'
    && results.gateOn === 'true'
    && results.autoClose === 'false'
  console.log('RESULT:', ok ? 'OSK_OK' : 'OSK_FAIL')
  win.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => {
  console.log('ERR', e && e.stack)
  app.exit(2)
})
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
