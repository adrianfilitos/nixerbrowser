const { BrowserWindow, webContents } = require('electron')

const windows = new Map()
let nextWindowId = 1

function ctxFor(event) {
  const win = BrowserWindow.fromWebContents(event.sender)
  return windows.get(win) || null
}

function ctxForWc(wc) {
  const win = BrowserWindow.fromWebContents(wc)
  return windows.get(win) || null
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
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
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
