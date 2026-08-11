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
  await delay(300)
  await ui.executeJavaScript(`window.__status = 'none'`)
  results.gateCtx = { tv: store.settings().tvMode, ov: store.settings().gameOverlay }

  store.setSettings({ tvMode: false, gameOverlay: false })
  ipcMain.emit('tv:input-focus', {})
  await delay(300)
  results.gateOff = await ui.executeJavaScript('window.__status')

  store.setSettings({ tvMode: true })
  results.tvModeValue = store.settings().tvMode
  require('./util').broadcastSettings()
  ipcMain.emit('tv:input-focus', {})
  await delay(300)
  results.gateOn = await ui.executeJavaScript('window.__status')

  results.blurEmitReturn = ipcMain.emit('tv:input-blur', {})
  results.afterBlur1 = await ui.executeJavaScript('window.__status')
  await delay(1500)
  results.afterBlur2 = await ui.executeJavaScript('window.__status')
  await delay(1800)
  results.autoClose = await ui.executeJavaScript('window.__status')

  store.setSettings({ tvMode: true })
  require('./util').broadcastSettings()
  await delay(300)
  results.wvClick = await ui.executeJavaScript(`(async () => {
    const wv = document.querySelector('webview.active')
    if (!wv) return 'NO_WEBVIEW'
    wv.loadURL('data:text/html,<input id="f" style="position:fixed;top:50px;left:50px;width:200px;height:40px">')
    await new Promise((r) => setTimeout(r, 1500))
    const pos = await wv.executeJavaScript('(() => { const f = document.getElementById("f"); const r = f.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()')
    wv.sendInputEvent({ type: 'mouseDown', x: pos.x, y: pos.y, button: 'left', clickCount: 1 })
    wv.sendInputEvent({ type: 'mouseUp', x: pos.x, y: pos.y, button: 'left', clickCount: 1 })
    await new Promise((r) => setTimeout(r, 600))
    const focused = await wv.executeJavaScript('document.activeElement && document.activeElement.id')
    return { pos, focused }
  })()`).catch((e) => 'ERR:' + e.message)
  results.wvStatus = await ui.executeJavaScript('window.__status')

  results.kbTyped = await ui.executeJavaScript(`(async () => {
    const kb = document.querySelector('.tv-keyboard')
    if (!kb) return 'NO_KEYBOARD'
    const aKey = Array.from(kb.querySelectorAll('button')).find((b) => b.textContent.trim() === 'a')
    if (!aKey) return 'NO_KEY'
    aKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    aKey.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
    aKey.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    await new Promise((r) => setTimeout(r, 300))
    const wv = document.querySelector('webview.active')
    return await wv.executeJavaScript('document.activeElement && document.activeElement.value')
  })()`).catch((e) => 'ERR:' + e.message)

  results.addrFocus = await ui.executeJavaScript(`(async () => {
    const input = document.querySelector('.address-bar input')
    if (!input) return 'NO_INPUT'
    const r = input.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    window.api.uiPointer({ type: 'down', x, y, button: 'left', count: 1 })
    window.api.uiPointer({ type: 'up', x, y, button: 'left', count: 1 })
    await new Promise((r) => setTimeout(r, 400))
    return document.activeElement === input ? 'FOCUSED' : 'NOT_FOCUSED:' + (document.activeElement && document.activeElement.tagName + '.' + document.activeElement.className)
  })()`).catch((e) => 'ERR:' + e.message)

  console.log('OSK:', JSON.stringify(results))
  const ok = results.oskExists && results.focusChannel && results.blurChannel
    && results.tvFns === 'function/function'
    && results.openResult && results.openResult.ok === true
    && results.gateOff === 'none'
    && results.gateOn === 'true'
    && results.autoClose === 'false'
    && results.wvClick && results.wvClick.focused === 'f' && results.wvStatus === 'true'
    && results.addrFocus === 'FOCUSED'
    && results.kbTyped === 'a'
  console.log('RESULT:', ok ? 'OSK_OK' : 'OSK_FAIL')
  win.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => {
  console.log('ERR', e && e.stack)
  app.exit(2)
})
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
