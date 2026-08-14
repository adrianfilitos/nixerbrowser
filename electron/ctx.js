const { BrowserWindow, webContents } = require('electron')

const windows = new Map()
let nextWindowId = 1

function ctxFor(event) {
  const win = BrowserWindow.fromWebContents(event.sender)
  return windows.get(win) || null
}

function ctxForWc(wc) {
  const win = BrowserWindow.fromWebContents(wc)
  if (win && windows.has(win)) return windows.get(win)
  // fallback: buscar la ventana cuya pestaña (WebContentsView) tenga este webContents
  for (const c of windows.values()) {
    if (c.tabs && c.tabs.size) {
      for (const tab of c.tabs.values()) {
        if (tab.wc === wc) return c
      }
    }
  }
  return null
}

function ui(ctx) {
  return ctx && ctx.win ? ctx.win.webContents : null
}

function activeWc(ctx) {
  return ctx && ctx.activeWcId ? webContents.fromId(ctx.activeWcId) : null
}

function sendUi(ctx, action, data) {
  const t = ui(ctx)
  if (t && !t.isDestroyed()) t.send('ui-action', action, data)
}

function currentCtx() {
  let win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
  if (!win) return null
  if (!windows.has(win)) {
    // El foco puede estar en una ventana-popup (menú/diálogo) que no está
    // registrada: se resuelve su contexto a través de la ventana padre.
    try {
      const parent = win.getParentWindow()
      if (parent && windows.has(parent)) return windows.get(parent)
    } catch {}
    win = BrowserWindow.getAllWindows().find((w) => windows.has(w)) || null
    if (!win) return null
  }
  return windows.get(win) || null
}

function registerWindow(win, ctx) {
  windows.set(win, ctx)
}

function unregisterWindow(win) {
  windows.delete(win)
}

function nextWindow() {
  return ++nextWindowId
}

module.exports = {
  windows,
  ctxFor,
  ctxForWc,
  ui,
  activeWc,
  sendUi,
  currentCtx,
  registerWindow,
  unregisterWindow,
  nextWindow,
}
