const { BrowserWindow, globalShortcut, Notification, screen } = require('electron')
const path = require('path')
const { DEV_SERVER_URL } = require('./constants')
const ctx = require('./ctx')

let overlayWin = null
let overlayCtx = null
let prevHwnd = null
let lastToggleTs = 0

let koffi = null
let user32 = null
let xinput = null
let getStateFn = null
let setFgFn = null
let setWinPosFn = null
let xinputTimer = null
let lastChordTs = 0

let onToast = null
let settings = () => ({})
let chordBits = 0x0010 | 0x0020
let hotkeyActive = ''

const SWP_NOMOVE = 0x0002
const SWP_NOSIZE = 0x0001
const SWP_NOACTIVATE = 0x0010
const HWND_TOPMOST = -1

function loadWin32() {
  if (user32) return true
  try {
    koffi = require('koffi')
    user32 = koffi.load('user32.dll')
    xinput = koffi.load('xinput1_4.dll')
    koffi.struct('XINPUT_STATE', {
      dwPacketNumber: 'uint32',
      wButtons: 'uint16',
      bLeftTrigger: 'uint8',
      bRightTrigger: 'uint8',
      sThumbLX: 'int16',
      sThumbLY: 'int16',
      sThumbRX: 'int16',
      sThumbRY: 'int16',
      dwReserved: 'uint32',
      dwReserved2: 'uint32',
    })
    getStateFn = xinput.func('int __stdcall XInputGetState(int userIndex, _Out_ XINPUT_STATE *state)')
    setFgFn = user32.func('__stdcall', 'SetForegroundWindow', 'int', [koffi.pointer('void')])
    setWinPosFn = user32.func('__stdcall', 'SetWindowPos', 'int', [koffi.pointer('void'), koffi.pointer('void'), 'int', 'int', 'int', 'int', 'uint32'])
    return true
  } catch (e) {
    console.log('[OVL] win32 no disponible:', e && e.message)
    return false
  }
}

function hwndOf(win) {
  if (!koffi || !win || win.isDestroyed()) return null
  try {
    const buf = win.getNativeWindowHandle()
    return koffi.decode(buf, koffi.pointer('void'))
  } catch {
    return null
  }
}

function sameHwnd(a, b) {
  if (a === b) return true
  try { return !!a && !!b && koffi.address(a) === koffi.address(b) } catch { return false }
}

// Desbloquea el "foreground lock" de Windows para poder traer el overlay al
// primer plano incluso cuando otra app (un juego) tiene el foco. SPI pone el
// timeout de bloqueo a 0 y el doble toque de Alt es el truco clásico que
// libera la restricción de SetForegroundWindow.
function unlockForeground(h) {
  try {
    const spi = user32.func('__stdcall', 'SystemParametersInfoW', 'int', ['uint32', 'uint32', koffi.pointer('void'), 'uint32'])
    spi(0x2001, 0, null, 0)
  } catch {}
  try {
    const kb = user32.func('__stdcall', 'keybd_event', 'void', ['uint8', 'uint8', 'uint32', 'intptr'])
    kb(0x12, 0, 0, 0)
    kb(0x12, 0, 2, 0)
  } catch {}
  try { setFgFn(h) } catch {}
}

function bringToFront(win) {
  if (!win || win.isDestroyed()) return
  try { win.show() } catch {}
  try { win.moveTop() } catch {}
  try { win.focus() } catch {}
  if (loadWin32()) {
    const h = hwndOf(win)
    if (h) {
      unlockForeground(h)
      try { setWinPosFn(h, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE) } catch {}
    }
  }
}

function restoreFocus() {
  if (loadWin32() && prevHwnd) {
    try { setFgFn(prevHwnd) } catch {}
    prevHwnd = null
  }
}

function createOverlay() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const bounds = display.workArea
  const w = 460
  const h = 640
  const win = new BrowserWindow({
    x: Math.round(bounds.x + bounds.width - w - 16),
    y: Math.round(bounds.y + 16),
    width: w,
    height: h,
    minWidth: 320,
    minHeight: 400,
    frame: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#141414',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      webviewTag: true,
      backgroundColor: '#141414',
    },
  })
  overlayCtx = { id: ctx.nextWindow(), win, incognito: false, activeWcId: null }
  ctx.registerWindow(win, overlayCtx)

  if (process.env.DEBUG_OVERLAY === '1') console.log('[OVL] createOverlay en', JSON.stringify({ x: bounds.x + bounds.width - w - 16, y: bounds.y + 16 }))

  if (appIsPackaged()) win.loadFile(path.join(__dirname, '..', 'dist', 'overlay.html'))
  else win.loadURL(DEV_SERVER_URL.replace(/\/$/, '') + '/overlay.html')
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    if (code === -105 || code === -102 || code === -3) {
      win.loadFile(path.join(__dirname, '..', 'dist', 'overlay.html'))
    }
  })

  win.on('close', (e) => {
    if (!global.__nixerQuitting) {
      e.preventDefault()
      hideOverlay()
    }
  })
  win.on('closed', () => {
    if (overlayCtx) ctx.unregisterWindow(win)
    overlayCtx = null
  })
  win.on('blur', () => {
    if (process.env.DEBUG_OVERLAY === '1') console.log('[OVL] blur')
  })
  overlayWin = win
  return win
}

function appIsPackaged() {
  try { return require('electron').app.isPackaged } catch { return false }
}

function openOverlay() {
  if (overlayWin && !overlayWin.isDestroyed()) {
    bringToFront(overlayWin)
    return
  }
  if (loadWin32()) prevHwnd = fgHwnd()
  const win = createOverlay()
  win.webContents.once('did-finish-load', () => {
    if (!win.isDestroyed()) bringToFront(win)
  })
  watchdog(win)
}

// Comprueba de verdad que el overlay haya conseguido el primer plano
// (GetForegroundWindow), no solo que esté mapeado (isVisible es true incluso
// tapado por un juego en fullscreen exclusiva). Si no, reintenta el desbloqueo
// y al final avisa con una notificación del sistema, que SÍ se ve por encima
// de los juegos en exclusiva.
function watchdog(win) {
  const start = Date.now()
  const check = () => {
    if (!win || win.isDestroyed()) return
    if (loadWin32()) {
      const h = hwndOf(win)
      if (h && sameHwnd(fgHwnd(), h)) {
        if (process.env.DEBUG_OVERLAY === '1') console.log('[OVL] watchdog: overlay al frente')
        return
      }
      if (win.isVisible()) bringToFront(win)
    }
    if (Date.now() - start > 1800) {
      console.log('[OVL] AVISO: el overlay no ha conseguido el primer plano (juego en pantalla completa exclusiva?)')
      notifyOccluded(win)
      return
    }
    setTimeout(check, 300)
  }
  setTimeout(check, 300)
}

function notifyOccluded(win) {
  try {
    const n = new Notification({
      title: 'Nixer Browser - Overlay',
      body: 'El juego esta en pantalla completa exclusiva y el overlay no puede mostrarse encima. Pulsa Ctrl+Shift+O (o el combo del mando) o pon el juego en ventana sin bordes.',
    })
    n.on('click', () => { if (win && !win.isDestroyed()) bringToFront(win) })
    n.show()
  } catch {}
  if (onToast) onToast('El overlay no se ve: si el juego esta en pantalla completa exclusiva, ponlo en ventana sin bordes', 'info')
}

function hideOverlay() {
  if (!overlayWin || overlayWin.isDestroyed()) return
  overlayWin.hide()
  restoreFocus()
}

function toggleOverlay() {
  if (overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible()) {
    hideOverlay()
  } else {
    openOverlay()
  }
}

// Debounce: evita que la auto-repeticion de tecla (o un doble disparo rapido)
// abra y cierre el overlay en bucle.
function handleHotkey() {
  const now = Date.now()
  if (now - lastToggleTs < 300) return
  lastToggleTs = now
  toggleOverlay()
}

function fgHwnd() {
  if (!loadWin32()) return null
  try {
    const getFg = user32.func('__stdcall', 'GetForegroundWindow', koffi.pointer('void'), [])
    return getFg()
  } catch { return null }
}

function startXinputPoll() {
  if (xinputTimer) return
  if (!loadWin32()) return
  let delay = 250
  const poll = () => {
    let found = false
    const now = Date.now()
    for (let i = 0; i < 4; i++) {
      try {
        const st = [null]
        const r = getStateFn(i, st)
        if (r === 0 && st[0]) {
          found = true
          if (chordBits && (st[0].wButtons & chordBits) === chordBits && now - lastChordTs > 800) {
            lastChordTs = now
            console.log('[OVL] chord de mando detectado (XInput)')
            toggleOverlay()
          }
        }
      } catch {}
    }
    delay = found ? 33 : 250
    if (xinputTimer) xinputTimer = setTimeout(poll, delay)
  }
  xinputTimer = setTimeout(poll, delay)
}

function stopXinputPoll() {
  clearTimeout(xinputTimer)
  xinputTimer = null
}

function isValidAccelerator(v) {
  const s = String(v || '').trim()
  if (!s) return false
  const parts = s.split('+').map((x) => x.trim())
  if (!parts.length) return false
  const MODS = /^(commandorcontrol|cmd|command|ctrl|control|shift|alt|option|altgr|super|meta)$/i
  const KEYS = /^[a-z0-9]$|^(f[1-9]|f1[0-9]|f2[0-4]|enter|return|tab|space|backspace|delete|insert|home|end|pageup|pagedown|escape|esc|up|down|left|right|printscreen|scrolllock|pause|numlock|capslock|comma|period|semicolon|slash|backslash|bracketleft|bracketright|minus|equal)$/i
  if (!KEYS.test(parts[parts.length - 1])) return false
  for (let i = 0; i < parts.length - 1; i++) {
    if (!MODS.test(parts[i])) return false
  }
  return true
}

function registerHotkey() {
  const s = settings()
  const accel = s.overlayHotkey || 'CommandOrControl+Shift+O'
  if (!isValidAccelerator(accel)) {
    console.log('[OVL] atajo no válido:', accel)
    if (onToast) onToast('Atajo de teclado no válido: ' + accel, 'info')
    return
  }
  if (hotkeyActive === accel) return
  try { globalShortcut.unregister(hotkeyActive) } catch {}
  hotkeyActive = ''
  try {
    const ok = globalShortcut.register(accel, () => handleHotkey())
    if (ok) { hotkeyActive = accel; console.log('[OVL] atajo global activo:', accel) }
    else console.log('[OVL] no se pudo registrar el atajo global:', accel)
  } catch (e) {
    console.log('[OVL] error al registrar el atajo:', e && e.message)
  }
}

function applySettings() {
  const s = settings()
  const on = !!s.gameOverlay
  if (!on) {
    stopXinputPoll()
    if (hotkeyActive) {
      try { globalShortcut.unregister(hotkeyActive) } catch {}
      hotkeyActive = ''
    }
    return
  }
  const c = s.overlayChord
  if (c === 'lbRbStart') chordBits = 0x0100 | 0x0200 | 0x0010
  else if (c === 'off') chordBits = 0
  else chordBits = 0x0010 | 0x0020
  if (chordBits) startXinputPoll()
  registerHotkey()
}

function init(deps) {
  if (deps) {
    if (deps.onToast) onToast = deps.onToast
    if (deps.getSettings) settings = deps.getSettings
  }
}

function shutdown() {
  stopXinputPoll()
  if (hotkeyActive) {
    try { globalShortcut.unregister(hotkeyActive) } catch {}
    hotkeyActive = ''
  }
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.destroy()
  overlayWin = null
}

function getWindow() {
  return overlayWin && !overlayWin.isDestroyed() ? overlayWin : null
}

function getDebug() {
  let overlayFg = false
  if (overlayWin && !overlayWin.isDestroyed()) {
    const h = hwndOf(overlayWin)
    overlayFg = !!(h && loadWin32() && sameHwnd(fgHwnd(), h))
  }
  return {
    xinput: !!getStateFn,
    hotkey: hotkeyActive,
    hotkeyMode: hotkeyActive ? 'globalShortcut' : 'off',
    overlayOpen: !!(overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible()),
    overlayFg,
  }
}

module.exports = { init, applySettings, shutdown, toggleOverlay, getWindow, getDebug, registerHotkey, isValidAccelerator }
