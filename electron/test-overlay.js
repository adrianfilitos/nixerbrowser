const { app, ipcMain, BrowserWindow, globalShortcut } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-overlay-profile')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
const store = require('./store')
const ACCEL = 'Alt+Shift+O'
store.setSettings({
  gameOverlay: true,
  overlayHotkey: ACCEL,
  overlayChord: 'startBack',
})
const overlayMod = require('./overlay')
require('./main')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

// Entrega REAL de teclas: keybd_event sintetiza el combo en la cola de entrada
// del sistema, igual que un teclado físico. Esto prueba que el atajo dispara
// de verdad (no solo que esté "registrado").
const koffi = require('koffi')
const user32 = koffi.load('user32.dll')
const keybd = user32.func('__stdcall', 'keybd_event', 'void', ['uint8', 'uint8', 'uint32', 'intptr'])
const KEYUP = 2
const VKS = { alt: 0x12, shift: 0x10, ctrl: 0x11, control: 0x11 }
function sendCombo(accel) {
  const parts = String(accel).split('+').map((s) => s.trim().toLowerCase())
  const key = parts[parts.length - 1]
  const mods = parts.slice(0, -1).map((m) => VKS[m])
  for (const m of mods) keybd(m, 0, 0, 0)
  if (key.length === 1) {
    const vk = key.toUpperCase().charCodeAt(0)
    keybd(vk, 0, 0, 0)
    keybd(vk, 0, KEYUP, 0)
  }
  for (let i = mods.length - 1; i >= 0; i--) keybd(mods[i], 0, KEYUP, 0)
}

async function waitOpen(timeout) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    const ov = overlayMod.getWindow()
    if (ov && !ov.isDestroyed() && ov.isVisible()) return ov
    await delay(200)
  }
  return null
}

async function waitHidden(timeout) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    const ov = overlayMod.getWindow()
    if (!ov || ov.isDestroyed() || !ov.isVisible()) return true
    await delay(200)
  }
  return false
}

async function waitFg(timeout) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    const dbg = overlayMod.getDebug()
    if (dbg.overlayFg) return true
    await delay(250)
  }
  return false
}

app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 20 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  await delay(2000)

  const results = {}

  // --- Fase A: atajo global (vía principal) -----------------------------
  try { results.hotkeyGlobal = globalShortcut.isRegistered(ACCEL) } catch { results.hotkeyGlobal = false }
  results.modeGlobal = overlayMod.getDebug().hotkeyMode === 'globalShortcut'

  // Doble combo rapido: si el debounce funciona, el overlay queda ABIERTO
  // (1 toggle); si no, se abre y se cierra (window existe pero oculta).
  sendCombo(ACCEL)
  sendCombo(ACCEL)
  const ovOpen = await waitOpen(8000)
  results.deliveredGlobal = !!ovOpen
  results.debounced = results.deliveredGlobal
  results.overlayProps = ovOpen ? {
    alwaysOnTop: ovOpen.isAlwaysOnTop(),
    visible: ovOpen.isVisible(),
    url: ovOpen.webContents.getURL(),
  } : null
  results.overlayFg = await waitFg(6000)

  // Pestañas: barra con al menos 1, y el boton "+" crea una nueva.
  if (ovOpen) {
    try {
      const tabs0 = await ovOpen.webContents.executeJavaScript("document.querySelectorAll('.ov-tab').length")
      await ovOpen.webContents.executeJavaScript("document.querySelector('.ov-tab-new').click()")
      await delay(300)
      const tabs1 = await ovOpen.webContents.executeJavaScript("document.querySelectorAll('.ov-tab').length")
      const tabCloseOk = await ovOpen.webContents.executeJavaScript(
        "new Promise(function(res){var b=document.querySelector('.ov-tab-close');if(!b){res(false);return;}b.click();setTimeout(function(){res(document.querySelectorAll('.ov-tab').length===1);},300);})"
      )
      results.tabs = { before: tabs0, afterNew: tabs1, closeOk: tabCloseOk }
    } catch (e) {
      results.tabs = { error: e && e.message }
    }
  }

  await delay(600)
  sendCombo(ACCEL)
  results.closedGlobal = await waitHidden(4000)

  console.log('OVERLAY:', JSON.stringify(results))
  const ok = results.hotkeyGlobal === true
    && results.modeGlobal === true
    && results.deliveredGlobal === true
    && results.debounced === true
    && results.overlayProps && results.overlayProps.alwaysOnTop === true
    && /overlay\.html/.test(results.overlayProps.url || '')
    && results.overlayFg === true
    && results.closedGlobal === true
    && results.tabs && results.tabs.before >= 1
    && results.tabs.afterNew === results.tabs.before + 1
    && results.tabs.closeOk === true
  console.log('RESULT:', ok ? 'OVERLAY_OK' : 'OVERLAY_FAIL')
  overlayMod.shutdown()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => {
  console.log('ERR', e && e.stack)
  app.exit(2)
})
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 120000)
