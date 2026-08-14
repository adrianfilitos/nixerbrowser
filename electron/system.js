const { app, BrowserWindow, Menu, nativeImage, session, Tray } = require('electron')
const path = require('path')
const store = require('./store')
const { windows, ui, ctxForWc } = require('./ctx')

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

// ---- Catálogo de permisos (modelo Chromium) --------------------------------
// Cada tipo tiene: default ('allow' | 'ask' | 'deny'), persist (si se guarda
// como regla por sitio) y label. Sustituye a los sets fijos AUTO_ALLOW/ASK/DENY.
const PERM_CATALOG = {
  fullscreen: { default: 'allow', persist: false, label: 'Pantalla completa' },
  pointerLock: { default: 'allow', persist: false, label: 'Bloqueo del puntero' },
  'clipboard-sanitized-write': { default: 'allow', persist: false, label: 'Escribir portapapeles' },
  openExternal: { default: 'allow', persist: false, label: 'Abrir enlaces externos' },
  midi: { default: 'allow', persist: false, label: 'MIDI' },
  midiSysex: { default: 'allow', persist: false, label: 'MIDI (sistema)' },
  autoplay: { default: 'allow', persist: false, label: 'Reproducción automática' },
  sensors: { default: 'allow', persist: false, label: 'Sensores' },
  backgroundSync: { default: 'allow', persist: false, label: 'Sincronización en segundo plano' },
  wakeLock: { default: 'allow', persist: false, label: 'Bloqueo de pantalla activo' },

  media: { default: 'ask', persist: true, label: 'Cámara y micrófono' },
  camera: { default: 'ask', persist: true, label: 'Cámara' },
  microphone: { default: 'ask', persist: true, label: 'Micrófono' },
  geolocation: { default: 'ask', persist: true, label: 'Ubicación' },
  notifications: { default: 'ask', persist: true, label: 'Notificaciones' },
  'clipboard-read': { default: 'ask', persist: true, label: 'Leer portapapeles' },
  'display-capture': { default: 'ask', persist: true, label: 'Captura de pantalla' },
  keyboardLock: { default: 'ask', persist: true, label: 'Bloqueo de teclado' },
  'window-management': { default: 'ask', persist: true, label: 'Ventanas' },
  fileSystem: { default: 'ask', persist: true, label: 'Archivos' },
  serial: { default: 'ask', persist: true, label: 'Puertos serie' },
  hid: { default: 'ask', persist: true, label: 'Dispositivos HID' },
  usb: { default: 'ask', persist: true, label: 'Dispositivos USB' },
  bluetooth: { default: 'ask', persist: true, label: 'Bluetooth' },
  'storage-access': { default: 'ask', persist: true, label: 'Almacenamiento' },
  'local-fonts': { default: 'ask', persist: true, label: 'Fuentes locales' },
  'idle-detection': { default: 'ask', persist: true, label: 'Detección de inactividad' },
  screenWakeLock: { default: 'ask', persist: true, label: 'Bloqueo de pantalla' },
  vr: { default: 'ask', persist: true, label: 'Realidad virtual' },
  nfc: { default: 'ask', persist: true, label: 'NFC' },
  payments: { default: 'ask', persist: true, label: 'Pagos' },

  unknown: { default: 'ask', persist: true, label: 'Permiso' },
}

const pendingPermits = new Map()
let permId = 0

// Grants temporales "Permitir una vez": viven en memoria por pestaña (wcId) y
// expiran al navegar a otro documento o al cerrar la pestaña. No se persisten.
const onceGrants = new Map() // wcId -> Map<origin, Set<permission>>
const trackedWc = new Set()

function trackOnceWc(wc) {
  const wcId = wc.id
  if (trackedWc.has(wcId)) return
  trackedWc.add(wcId)
  wc.on('did-navigate', () => { onceGrants.delete(wcId) })
  wc.on('destroyed', () => { onceGrants.delete(wcId); trackedWc.delete(wcId) })
}

function grantOnce(wcId, origin, permission) {
  if (!wcId || !origin || !permission) return
  const byOrigin = onceGrants.get(wcId) || new Map()
  const set = byOrigin.get(origin) || new Set()
  set.add(permission)
  byOrigin.set(origin, set)
  onceGrants.set(wcId, byOrigin)
}

function hasOnce(wcId, origin, permission) {
  const byOrigin = onceGrants.get(wcId)
  return !!(byOrigin && byOrigin.get(origin) && byOrigin.get(origin).has(permission))
}

// Regla cuádruple: 'allow' | 'deny' | 'ask' | 'once'. Compatible con booleans legacy.
function normalizeRule(v) {
  if (v === true || v === 'allow') return 'allow'
  if (v === false || v === 'deny') return 'deny'
  if (v === 'once') return 'once'
  return 'ask'
}

function catalogEntry(permission) {
  return PERM_CATALOG[permission] || PERM_CATALOG.unknown
}

// Familia de permisos de media: una solicitud llega como 'media' pero los
// permission-checks de Chromium consultan 'camera'/'microphone' por separado.
// Al aprobar/denegar uno se refleja en toda la familia para que cualquier
// check posterior (p. ej. navigator.permissions.query) responda correctamente.
function mediaFamily(p) {
  if (p === 'media') return ['media', 'camera', 'microphone']
  if (p === 'camera' || p === 'microphone') return ['media', p]
  return [p]
}

function permAllowed(origin, permission, wcId) {
  const s = store.settings()
  const rules = (origin && s.sitePermissions && s.sitePermissions[origin]) || {}
  const family = mediaFamily(permission)
  for (const f of family) {
    const state = normalizeRule(rules[f])
    if (state === 'deny') return false
  }
  for (const f of family) {
    const state = normalizeRule(rules[f])
    if (state === 'allow') return true
  }
  for (const f of family) {
    if (hasOnce(wcId, origin, f)) return true
  }
  const def = catalogEntry(permission).default
  if (def === 'allow') return true
  if (def === 'deny') return false
  return null
}

function sendNextPending() {
  for (const [id, p] of pendingPermits) {
    if (p.sent) continue
    p.sent = true
    try {
      if (!p.target.isDestroyed()) {
        p.target.send('permission-request', { id, origin: p.origin, permission: p.permission })
        return
      }
    } catch {}
    pendingPermits.delete(id)
    try { p.cb(false) } catch {}
    return
  }
}

function initPermissions(ses) {
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    let origin = ''
    try { origin = new URL(details.requestingUrl).origin } catch {}
    if (!origin) return callback(false)
    const d = permAllowed(origin, permission, wc.id)
    if (d === true) return callback(true)
    if (d === false) return callback(false)
    const win = BrowserWindow.fromWebContents(wc)
    const ctx = (win && windows.get(win)) || ctxForWc(wc)
    const target = ctx && ui(ctx)
    if (!target) return callback(false)
    const id = ++permId
    pendingPermits.set(id, { cb: callback, origin, permission, target, sent: false, wcId: wc.id, wc })
    sendNextPending()
    setTimeout(() => {
      if (pendingPermits.has(id)) {
        pendingPermits.delete(id)
        try { callback(false) } catch {}
        sendNextPending()
      }
    }, 30000)
  })
  ses.setPermissionCheckHandler((wc, permission, requestingOrigin) => {
    let origin = ''
    try { origin = new URL(requestingOrigin).origin } catch { origin = requestingOrigin || '' }
    return permAllowed(origin, permission, wc ? wc.id : undefined) === true
  })
}

function respondPermission(id, opts) {
  const p = pendingPermits.get(id)
  if (!p) return
  pendingPermits.delete(id)
  opts = opts || {}
  const mode = opts.mode || (opts.allow ? 'allow' : 'deny')
  const family = mediaFamily(p.permission)
  if (mode === 'once') {
    if (opts.allow) {
      if (p.wc) { trackOnceWc(p.wc); for (const f of family) grantOnce(p.wc.id, p.origin, f) }
      try { p.cb(true) } catch {}
      sendNextPending()
      return
    }
    try { p.cb(false) } catch {}
    sendNextPending()
    return
  }
  // 'allow' y 'deny' son PERMANENTES por sitio (como Chrome): se persisten para
  // que el permission-check real del navegador responda granted/denied y la
  // página reciba la confirmación de verdad (no un falso grant de una sola vez).
  try { p.cb(mode === 'allow') } catch {}
  const s = store.settings()
  s.sitePermissions = s.sitePermissions || {}
  s.sitePermissions[p.origin] = s.sitePermissions[p.origin] || {}
  for (const f of family) s.sitePermissions[p.origin][f] = mode === 'allow'
  store.setSettings({ sitePermissions: s.sitePermissions })
  require('./util').broadcastSettings()
  sendNextPending()
}

// ---- Gestión de permisos por sitio ----------------------------------------

function listSitePermissions() {
  const s = store.settings()
  const out = []
  for (const [origin, perms] of Object.entries(s.sitePermissions || {})) {
    const items = []
    for (const [perm, val] of Object.entries(perms)) {
      items.push({ permission: perm, state: normalizeRule(val) })
    }
    out.push({ origin, perms: items })
  }
  out.sort((a, b) => a.origin.localeCompare(b.origin))
  return out
}

function setSitePermission(origin, permission, state) {
  if (!origin || !permission) return
  const s = store.settings()
  s.sitePermissions = s.sitePermissions || {}
  s.sitePermissions[origin] = s.sitePermissions[origin] || {}
  if (normalizeRule(state) === 'ask') delete s.sitePermissions[origin][permission]
  else s.sitePermissions[origin][permission] = normalizeRule(state) === 'allow'
  if (Object.keys(s.sitePermissions[origin]).length === 0) delete s.sitePermissions[origin]
  store.setSettings({ sitePermissions: s.sitePermissions })
  require('./util').broadcastSettings()
}

function clearSitePermissions(origin) {
  if (!origin) return
  const s = store.settings()
  s.sitePermissions = s.sitePermissions || {}
  delete s.sitePermissions[origin]
  store.setSettings({ sitePermissions: s.sitePermissions })
  require('./util').broadcastSettings()
}

function clearAllSitePermissions() {
  store.setSettings({ sitePermissions: {} })
  require('./util').broadcastSettings()
}

module.exports = {
  setupTray,
  syncLoginItem,
  isQuitting,
  initPermissions,
  respondPermission,
  listSitePermissions,
  setSitePermission,
  clearSitePermissions,
  clearAllSitePermissions,
  grantOnce,
  clearOnceForWc: (wcId) => onceGrants.delete(wcId),
  permCatalog: PERM_CATALOG,
}
