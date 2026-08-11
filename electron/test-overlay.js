const { app, ipcMain, BrowserWindow, globalShortcut } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-overlay-profile')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
const store = require('./store')
store.setSettings({
  gameOverlay: true,
  overlayHotkey: 'CommandOrControl+Shift+O',
  overlayChord: 'startBack',
  overlayHookLL: false,
})
const overlayMod = require('./overlay')
require('./main')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 20 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  await delay(2000)

  const results = {}
  try { results.hotkeyGlobal = globalShortcut.isRegistered('CommandOrControl+Shift+O') } catch { results.hotkeyGlobal = false }

  ipcMain.emit('overlay:toggle')
  let ov = null
  for (let i = 0; i < 20 && !ov; i++) { ov = overlayMod.getWindow(); if (!ov) await delay(400) }
  results.overlayCreated = !!ov
  if (ov) {
    let vis = ov.isVisible()
    for (let i = 0; i < 16 && !vis; i++) { await delay(500); try { vis = ov.isVisible() } catch {} }
    await delay(400)
    let url = ''
    try { url = ov.webContents.getURL() } catch {}
    results.overlayProps = {
      alwaysOnTop: ov.isAlwaysOnTop(),
      visible: ov.isVisible(),
      url,
    }
  }

  ipcMain.emit('overlay:toggle')
  await delay(600)
  const ov2 = overlayMod.getWindow()
  results.overlayHidden = !!ov2 && !ov2.isVisible()
  results.overlayKept = !!ov2

  store.setSettings({ overlayHookLL: true })
  overlayMod.applySettings()
  await delay(400)
  const dbg = overlayMod.getDebug()
  results.llHook = dbg.llHook
  results.xinput = dbg.xinput
  try { results.hotkeyAfterLL = globalShortcut.isRegistered('CommandOrControl+Shift+O') } catch { results.hotkeyAfterLL = false }

  console.log('OVERLAY:', JSON.stringify(results))
  const ok = results.hotkeyGlobal === true
    && results.overlayCreated === true
    && results.overlayProps && results.overlayProps.alwaysOnTop === true
    && results.overlayProps.visible === true
    && /overlay\.html/.test(results.overlayProps.url || '')
    && results.overlayHidden === true
    && results.overlayKept === true
    && results.llHook === true
    && results.xinput === true
    && results.hotkeyAfterLL === false
  console.log('RESULT:', ok ? 'OVERLAY_OK' : 'OVERLAY_FAIL')
  overlayMod.shutdown()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => {
  console.log('ERR', e && e.stack)
  app.exit(2)
})
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
