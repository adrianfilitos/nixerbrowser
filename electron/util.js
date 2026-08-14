const { app, BrowserWindow, dialog, webContents } = require('electron')
const path = require('path')
const fs = require('fs')
const store = require('./store')
const adblock = require('./adblock')
const { windows, ui } = require('./ctx')
const { PROFILE } = require('./constants')

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
  const list = store.downloads()
  for (const ctx of windows.values()) {
    const t = ui(ctx)
    if (t && !t.isDestroyed()) t.send('downloads-updated', list)
  }
  // webviews internos (página de Descargas) también reciben el estado en vivo
  for (const wc of webContents.getAllWebContents()) {
    if (!wc.hostWebContents) continue
    const u = wc.getURL()
    if (u.startsWith('nixer://') || u.startsWith('file:')) {
      try { wc.send('downloads-updated', list) } catch {}
    }
  }
}

function settingsForUi() {
  const s = { ...store.settings() }
  s.aiApiKey = store.decryptSecret(s.aiApiKey)
  s.autofillProfile = store.decryptProfile(s.autofillProfile)
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
    const t = wc.getType()
    if ((t !== 'webview' && t !== 'browserView') || wc.isDestroyed() || activeIds.has(wc.id)) continue
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
    build: buildHash(),
    buildTime: buildTime(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    userData: app.getPath('userData'),
    profile: PROFILE,
    defaultEngine: store.engineById(store.settings().defaultSearchEngine).name,
    extensions: store.listExtensions().length,
    adblockDomains: adblock.stats().count || 0,
  }
}

let _buildHash = null
function buildHash() {
  if (_buildHash) return _buildHash
  try {
    const { execSync } = require('child_process')
    _buildHash = execSync('git rev-parse --short HEAD', { cwd: path.join(__dirname, '..'), timeout: 3000 }).toString().trim()
  } catch {
    _buildHash = app.isPackaged ? 'dist' : 'dev'
  }
  return _buildHash
}

let _buildTime = null
function buildTime() {
  if (_buildTime) return _buildTime
  try {
    const p = path.join(__dirname, '..', 'dist', 'index.html')
    if (fs.existsSync(p)) _buildTime = new Date(fs.statSync(p).mtime).toISOString()
  } catch {}
  return _buildTime || ''
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