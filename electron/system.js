const { app, BrowserWindow, Menu, nativeImage, session, Tray } = require('electron')
const path = require('path')
const store = require('./store')
const { windows, ui } = require('./ctx')

let tray = null
let quitting = false

app.on('before-quit', () => { quitting = true })

function isQuitting() {
  return quitting
}

function setupTray() {
  if (tray) return
  try {
    let icon = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png'))
    if (icon.isEmpty()) icon = nativeImage.createEmpty()
    tray = new Tray(icon.resize({ width: 16, height: 16 }))
    tray.setToolTip('Nixer Browser')
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Abrir Nixer Browser', click: () => { BrowserWindow.getAllWindows().forEach((w) => { if (w.isMinimized()) w.restore(); w.show(); w.focus() }) } },
      { type: 'separator' },
      { label: 'Salir', click: () => { quitting = true; app.quit() } },
    ]))
  } catch {}
}

function syncLoginItem() {
  try { app.setLoginItemSettings({ openAtLogin: !!store.settings().launchAtStartup }) } catch {}
}

const AUTO_ALLOW_PERMS = new Set(['fullscreen', 'clipboard-sanitized-write', 'pointerLock', 'openExternal', 'midiSysex'])
const ASK_PERMS = new Set(['media', 'geolocation', 'notifications', 'clipboard-read', 'display-capture', 'keyboardLock', 'window-management', 'fileSystem'])
const pendingPermits = new Map()
let permId = 0

function permAllowed(origin, permission) {
  const s = store.settings()
  const rules = (s.sitePermissions && s.sitePermissions[origin]) || {}
  if (permission in rules) return rules[permission]
  if (AUTO_ALLOW_PERMS.has(permission)) return true
  if (ASK_PERMS.has(permission)) return null
  return false
}

function initPermissions(ses) {
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    let origin = ''
    try { origin = new URL(details.requestingUrl).origin } catch {}
    if (!origin) return callback(false)
    const d = permAllowed(origin, permission)
    if (d === true) return callback(true)
    if (d === false) return callback(false)
    const win = BrowserWindow.fromWebContents(wc)
    const ctx = windows.get(win)
    const target = ctx && ui(ctx)
    if (!target) return callback(false)
    const id = ++permId
    pendingPermits.set(id, { cb: callback, origin, permission })
    target.send('permission-request', { id, origin, permission })
    setTimeout(() => {
      if (pendingPermits.has(id)) {
        pendingPermits.delete(id)
        try { callback(false) } catch {}
      }
    }, 30000)
  })
  ses.setPermissionCheckHandler((wc, permission, requestingOrigin) => {
    const origin = requestingOrigin || ''
    if (!origin) return true
    return permAllowed(origin, permission) === true
  })
}

function respondPermission(id, allow, remember) {
  const p = pendingPermits.get(id)
  if (!p) return
  pendingPermits.delete(id)
  try { p.cb(!!allow) } catch {}
  if (remember) {
    const s = store.settings()
    s.sitePermissions = s.sitePermissions || {}
    s.sitePermissions[p.origin] = s.sitePermissions[p.origin] || {}
    s.sitePermissions[p.origin][p.permission] = !!allow
    store.setSettings({ sitePermissions: s.sitePermissions })
    require('./util').broadcastSettings()
  }
}

module.exports = { setupTray, syncLoginItem, isQuitting, initPermissions, respondPermission }
