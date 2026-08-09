const { app, BrowserWindow, dialog, webContents } = require('electron')
const path = require('path')
const fs = require('fs')
const store = require('./store')
const adblock = require('./adblock')
const { windows, ui } = require('./ctx')

function fileUrl(p) {
  return 'file://' + path.resolve(p).replace(/\\/g, '/')
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

function broadcastDownloads() {
  for (const ctx of windows.values()) {
    const t = ui(ctx)
    if (t && !t.isDestroyed()) t.send('downloads-updated', store.downloads())
  }
}

function settingsForUi() {
  const s = { ...store.settings() }
  s.aiApiKey = store.decryptSecret(s.aiApiKey)
  return s
}

function broadcastSettings() {
  const s = settingsForUi()
  for (const ctx of windows.values()) {
    const t = ui(ctx)
    if (t && !t.isDestroyed()) t.send('settings-updated', s)
  }
}

function gcHiddenWebviews() {
  if (!store.settings().memorySaver) return
  const activeIds = new Set()
  for (const ctx of windows.values()) {
    if (ctx.activeWcId) activeIds.add(ctx.activeWcId)
  }
  for (const wc of webContents.getAllWebContents()) {
    if (wc.getType() !== 'webview' || wc.isDestroyed() || activeIds.has(wc.id)) continue
    const win = BrowserWindow.fromWebContents(wc)
    if (!win || !windows.has(win)) continue
    try { wc.executeJavaScript('if (window.gc) window.gc()') } catch {}
  }
}

async function captureScreenshot(w) {
  if (!w) return null
  try {
    const img = await w.capturePage()
    const win = BrowserWindow.fromWebContents(w)
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: 'captura_' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.png',
      filters: [{ name: 'PNG', extensions: ['png'] }],
    })
    if (canceled || !filePath) return null
    fs.writeFileSync(filePath, img.toPNG())
    return filePath
  } catch {
    return null
  }
}

function togglePip(w) {
  if (!w) return
  try {
    w.executeJavaScript(`(function () {
      try {
        if (document.pictureInPictureElement) { document.exitPictureInPicture(); return 'exit' }
        var v = document.querySelector('video')
        if (v && v.requestPictureInPicture) { v.requestPictureInPicture().then(function () {}, function () {}); return 'enter' }
        return 'none'
      } catch (e) { return 'err' }
    })()`)
  } catch {}
}

function appInfo() {
  return {
    name: 'Nixer Browser',
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    userData: app.getPath('userData'),
    defaultEngine: store.engineById(store.settings().defaultSearchEngine).name,
    extensions: store.listExtensions().length,
    adblockDomains: adblock.stats().count || 0,
  }
}

module.exports = {
  fileUrl,
  escapeHtml,
  hostOf,
  broadcastDownloads,
  broadcastSettings,
  settingsForUi,
  gcHiddenWebviews,
  captureScreenshot,
  togglePip,
  appInfo,
}
