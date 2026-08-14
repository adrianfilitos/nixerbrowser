const { BrowserWindow } = require('electron')
const path = require('path')
const ctx = require('./ctx')

const open = new Map()

// Los popups/menús son VENTANAS nativas hijas (BrowserWindow sin marco) EXTERNAS
// a la ventana principal. Al vivir en otra superficie de composición del SO, la
// página (WebContentsView de la ventana principal) NUNCA deja de renderizar ni
// se mezcla con el menú. Cada ventana se ancla a la posición del botón (la UI
// manda coordenadas de ventana; aquí se convierten a coordenadas de pantalla).
function showPopup(wctx, opts) {
  const key = opts.key
  if (!key || !wctx || !wctx.win || wctx.win.isDestroyed()) return null
  hidePopup(wctx, key)
  let baseX = 0
  let baseY = 0
  try {
    const cb = wctx.win.getContentBounds()
    baseX = cb.x || 0
    baseY = cb.y || 0
  } catch {}
  const win = new BrowserWindow({
    parent: wctx.win,
    x: Math.round(baseX + (opts.x || 0)),
    y: Math.round(baseY + (opts.y || 0)),
    width: Math.max(120, Math.round(opts.width || 320)),
    height: Math.max(40, Math.round(opts.height || 200)),
    frame: false,
    show: false,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: false,
    focusable: opts.focusable !== false,
    backgroundColor: '#1b1b1b',
    useContentSize: true,
    webPreferences: {
      preload: path.join(__dirname, 'popup-preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })
  const wc = win.webContents
  let parentFocusFn = null
  win.on('closed', () => {
    if (parentFocusFn && wctx.win && !wctx.win.isDestroyed()) {
      try { wctx.win.removeListener('focus', parentFocusFn) } catch {}
    }
    const p = open.get(key)
    if (p && p.win === win) open.delete(key)
  })
  win.loadFile(path.join(__dirname, '..', 'pages', 'popup.html'))
  const rec = { win, wctx, payload: opts.payload || {}, keepOpen: !!opts.keepOpen }
  wc.once('did-finish-load', () => {
    if (win.isDestroyed()) return
    const cur = open.get(key)
    try { wc.send('popup-content', { key, payload: (cur && cur.payload) || {} }) } catch {}
    try { win.show() } catch {}
    if (opts.focus !== false) {
      try { win.focus() } catch {}
    }
  })
  // Cierre al pulsar FUERA: en lugar del 'blur' de la propia ventana (que en
  // Windows se dispara incluso al hacer clic dentro), se cierra cuando la
  // VENTANA PADRE recupera el foco (clic en la página o en el chrome de fuera).
  // Los popups con closeOnBlur:false (toasts, IA, autocompletado) se mantienen.
  if (opts.closeOnBlur !== false) {
    parentFocusFn = () => { if (open.get(key)) hidePopup(wctx, key) }
    if (wctx.win && !wctx.win.isDestroyed()) {
      wctx.win.on('focus', parentFocusFn)
    }
  }
  open.set(key, rec)
  return win
}

function hidePopup(wctx, key) {
  const p = open.get(key)
  if (!p) return
  open.delete(key)
  let wasFocused = false
  try { wasFocused = !p.win.isDestroyed() && p.win.isFocused() } catch {}
  try { if (!p.win.isDestroyed()) p.win.destroy() } catch {}
  // Devolver el foco a la principal SOLO si el popup cerrado lo tenía (menús
  // enfocados). Un popup no enfocado (toast/autocompletado, focusable:false) al
  // auto-ocultarse NO debe reenfocar la principal: eso dispararía 'focus' y
  // cerraría por fuera a otros popups (ej. el Administrador de tareas).
  if (p.wctx && p.wctx.win && !p.wctx.win.isDestroyed()) {
    try {
      if (wasFocused && !p.wctx.win.isFocused()) p.wctx.win.focus()
    } catch {}
  }
  if (p.wctx) {
    try { const ui = ctx.ui(p.wctx); if (ui && !ui.isDestroyed()) ui.send('popup-closed', key) } catch {}
  }
}

function hideAllForWindow(wctx) {
  for (const key of Array.from(open.keys())) {
    if (open.get(key).wctx === wctx) hidePopup(wctx, key)
  }
}

function wctxForWc(wc) {
  for (const p of open.values()) {
    if (p.win && p.win.webContents === wc) return p.wctx
  }
  return null
}

function updateContent(wctx, key, payload) {
  const p = open.get(key)
  if (!p || p.wctx !== wctx) return
  p.payload = payload
  try { if (!p.win.isDestroyed()) p.win.webContents.send('popup-content', { key, payload }) } catch {}
}

function reposition(wctx, key, x, y, width, height) {
  const p = open.get(key)
  if (!p || p.wctx !== wctx || !p.win || p.win.isDestroyed()) return
  let baseX = 0
  let baseY = 0
  try {
    const cb = wctx.win.getContentBounds()
    baseX = cb.x || 0
    baseY = cb.y || 0
  } catch {}
  try {
    if (typeof width === 'number' && typeof height === 'number') p.win.setSize(Math.max(120, Math.round(width)), Math.max(40, Math.round(height)))
    if (typeof x === 'number' && typeof y === 'number') p.win.setPosition(Math.round(baseX + x), Math.round(baseY + y))
  } catch {}
}

function debugBounds() {
  const out = []
  for (const [key, p] of open) {
    try { out.push({ key, bounds: p.win.getBounds() }) } catch {}
  }
  return out
}

function windowFor(key) {
  const p = open.get(key)
  return p && p.win && !p.win.isDestroyed() ? p.win : null
}

function isKeepOpen(key) {
  const p = open.get(key)
  return !!(p && p.keepOpen)
}

module.exports = { showPopup, hidePopup, hideAllForWindow, wctxForWc, updateContent, reposition, debugBounds, windowFor, isKeepOpen, count: () => open.size }
