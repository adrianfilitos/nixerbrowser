const { BrowserWindow, globalShortcut, screen } = require('electron')
const path = require('path')
const { DEV_SERVER_URL } = require('./constants')
const ctx = require('./ctx')

let overlayWin = null
let overlayCtx = null
let prevHwnd = null
let hotkeyTimer = null

let koffi = null
let user32 = null
let xinput = null
let getStateFn = null
let setFgFn = null
let setWinPosFn = null
let llHook = null
let llCallback = null
let pressedVk = new Set()
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
const WH_KEYBOARD_LL = 13
const WM_KEYDOWN = 0x0100
const WM_SYSKEYDOWN = 0x0104
const WM_KEYUP = 0x0101
const WM_SYSKEYUP = 0x0105

const VK = { CTRL: 0x11, SHIFT: 0x10, ALT: 0x12, O: 0x4F }

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
    koffi.struct('KBDLLHOOKSTRUCT', { vkCode: 'uint32', scanCode: 'uint32', flags: 'uint32', time: 'uint32', dwExtraInfo: 'intptr' })
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

function bringToFront(win) {
  if (!win || win.isDestroyed()) return
  try { win.show() } catch {}
  try { win.focus() } catch {}
  try { win.moveTop() } catch {}
  if (loadWin32()) {
    const h = hwndOf(win)
    if (h) {
      try { setFgFn(h) } catch {}
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
  setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible() && !win.webContents.isLoading()) {
      console.log('[OVL] AVISO: overlay no visible tras abrirlo (juego en pantalla completa exclusiva?)')
      if (onToast) onToast('El overlay no se ve: si el juego está en pantalla completa exclusiva, ponlo en ventana sin bordes', 'info')
    }
  }, 1500)
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

function fgHwnd() {
  if (!loadWin32()) return null
  try {
    const getFg = user32.func('__stdcall', 'GetForegroundWindow', koffi.pointer('void'), [])
    return getFg()
  } catch { return null }
}

function accelToVk(accel) {
  const parts = String(accel || '').split('+').map((s) => s.trim().toLowerCase())
  const mods = []
  let key = null
  for (const p of parts) {
    if (p === 'commandorcontrol' || p === 'ctrl' || p === 'control') mods.push(VK.CTRL)
    else if (p === 'shift') mods.push(VK.SHIFT)
    else if (p === 'alt') mods.push(VK.ALT)
    else if (/^[a-z0-9]$/.test(p)) key = p.toUpperCase().charCodeAt(0)
    else return null
  }
  if (!key || mods.length === 0) return null
  return { mods, key }
}

function installLowLevelHook(accel) {
  if (llHook) return true
  if (!loadWin32()) return false
  const map = accelToVk(accel)
  if (!map) return false
  try {
    const hookProto = koffi.proto('intptr __stdcall HookProc(int nCode, intptr wParam, intptr lParam)')
    const callNext = user32.func('__stdcall', 'CallNextHookEx', 'intptr', [koffi.pointer('void'), 'int', 'intptr', 'intptr'])
    llCallback = koffi.register(function (nCode, wParam, lParam) {
      if (nCode >= 0 && lParam) {
        try {
          const kb = koffi.decode(lParam, koffi.pointer('KBDLLHOOKSTRUCT'))
          const vk = kb && kb.vkCode
          if (wParam === WM_KEYDOWN || wParam === WM_SYSKEYDOWN) {
            pressedVk.add(vk)
            if (vk === map.key && map.mods.every((m) => pressedVk.has(m))) {
              toggleOverlay()
            }
          } else if (wParam === WM_KEYUP || wParam === WM_SYSKEYUP) {
            pressedVk.delete(vk)
          }
        } catch {}
      }
      return callNext(llHook, nCode, wParam, lParam)
    }, koffi.pointer(hookProto))
    const setHook = user32.func('__stdcall', 'SetWindowsHookExW', koffi.pointer('void'), ['int', koffi.pointer(hookProto), koffi.pointer('void'), 'uint32'])
    llHook = setHook(WH_KEYBOARD_LL, llCallback, null, 0)
    console.log('[OVL] hook de teclado LL activo:', !!llHook)
    return !!llHook
  } catch (e) {
    console.log('[OVL] error hook LL:', e && e.message)
    return false
  }
}

function uninstallLowLevelHook() {
  if (llHook && loadWin32()) {
    try {
      const unhook = user32.func('__stdcall', 'UnhookWindowsHookEx', 'int', [koffi.pointer('void')])
      unhook(llHook)
    } catch {}
    llHook = null
  }
  if (llCallback) {
    try { koffi.unregister(llCallback) } catch {}
    llCallback = null
  }
  pressedVk = new Set()
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

function registerHotkey() {
  const s = settings()
  const accel = s.overlayHotkey || 'CommandOrControl+Shift+O'
  if (s.overlayHookLL !== false) {
    if (llHook) return
    if (installLowLevelHook(accel)) {
      if (hotkeyActive) {
        try { globalShortcut.unregister(hotkeyActive) } catch {}
        hotkeyActive = ''
      }
      return
    }
  }
  if (hotkeyActive === accel) return
  try { globalShortcut.unregister(hotkeyActive) } catch {}
  hotkeyActive = ''
  try {
    const ok = globalShortcut.register(accel, () => toggleOverlay())
    if (ok) { hotkeyActive = accel; console.log('[OVL] hotkey global:', accel) }
    else console.log('[OVL] no se pudo registrar hotkey:', accel)
  } catch (e) {
    console.log('[OVL] error hotkey:', e && e.message)
  }
}

function applySettings() {
  const s = settings()
  const on = !!s.gameOverlay
  if (!on) {
    stopXinputPoll()
    if (hotkeyActive) { try { globalShortcut.unregister(hotkeyActive) } catch {}; hotkeyActive = '' }
    uninstallLowLevelHook()
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
  uninstallLowLevelHook()
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
  return {
    xinput: !!getStateFn,
    llHook: !!llHook,
    hotkey: hotkeyActive,
    overlayOpen: !!(overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible()),
  }
}

module.exports = { init, applySettings, shutdown, toggleOverlay, getWindow, getDebug, registerHotkey }
