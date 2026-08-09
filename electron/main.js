const { app, BrowserWindow, ipcMain, Menu, session, shell, dialog, webContents, net } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { execFile } = require('child_process')
const AdmZip = require('adm-zip')
const { ElectronChromeExtensions } = require('electron-chrome-extensions')

app.commandLine.appendSwitch('js-flags', '--expose-gc')
app.commandLine.appendSwitch('disable-features', 'OptimizationHints,MediaRouter,TranslateUI,NetworkTimeServiceQuerying,WebRtcLocalEcho,FontSrcLocalMatching,HistoryManipulationIntervention')

app.setName('Nixer Browser')
app.setAppUserModelId('com.nixer.browser')
app.setPath('userData', process.env.NIXER_USER_DATA || path.join(app.getPath('appData'), 'navegador'))

const store = require('./store')
const adblock = require('./adblock')
const ai = require('./ai')
const nixer = require('./nixer')

nixer.registerScheme()

if (store.settings().doh) {
  app.commandLine.appendSwitch('enable-features', 'DnsOverHttps')
  app.commandLine.appendSwitch('dns-over-https-templates', 'https://mozilla.cloudflare-dns.com/dns-query{?dns}')
  app.commandLine.appendSwitch('dns-over-https-templates-insecure-fallback')
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const url = (argv || []).find((a) => /^https?:\/\//i.test(a) || /^nixer:/.test(a))
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
    if (url) {
      const c = windows.get(win)
      if (c) sendUi(c, 'open-tab', url)
    }
  })
}

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
const PRIVATE_PARTITION = 'navegador-incognito'

const windows = new Map()
let nextWindowId = 1
let extEngine = null
const pendingExtCreate = []

const SB_CACHE = new Map() // host -> { bad, ts }
const SB_TTL = 6 * 3600 * 1000

function sbHost(url) {
  try { return new URL(url).hostname } catch { return null }
}

async function checkUrl(url, wc) {
  const host = sbHost(url)
  if (!host || !wc || wc.isDestroyed()) return
  const cached = SB_CACHE.get(host)
  if (cached && Date.now() - cached.ts < SB_TTL) {
    if (cached.bad) { try { wc.loadURL('nixer://warning?url=' + encodeURIComponent(url)) } catch {} }
    return
  }
  SB_CACHE.set(host, { bad: false, ts: Date.now() })
  try {
    const res = await net.fetch('https://urlhaus-api.abuse.ch/v1/url/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'url=' + encodeURIComponent(url),
      signal: AbortSignal.timeout(7000),
    })
    const json = await res.json().catch(() => null)
    const bad = !!(json && (json.query_status === 'online' || json.query_status === 'offline'))
    SB_CACHE.set(host, { bad, ts: Date.now() })
    if (bad && !wc.isDestroyed()) {
      try { wc.loadURL('nixer://warning?url=' + encodeURIComponent(url)) } catch {}
    }
  } catch {}
}

function setupExtensions() {
  extEngine = new ElectronChromeExtensions({
    license: 'GPL-3.0',
    session: session.defaultSession,
    createTab: (details) => {
      const c = currentCtx()
      if (c) sendUi(c, 'open-tab', details.url || '')
      return new Promise((resolve) => {
        pendingExtCreate.push(resolve)
        setTimeout(() => {
          const i = pendingExtCreate.indexOf(resolve)
          if (i >= 0) pendingExtCreate.splice(i, 1)
          resolve(null)
        }, 20000)
      })
    },
    createWindow: async () => createWindow().win,
    selectTab: (tab) => {
      if (!tab || tab.isDestroyed()) return
      let win = null
      try { win = BrowserWindow.fromWebContents(tab) } catch {}
      const c = win ? windows.get(win) : null
      if (c) sendUi(c, 'activate-tab', tab.id)
    },
    removeTab: (tab) => {
      if (!tab || tab.isDestroyed()) return
      let win = null
      try { win = BrowserWindow.fromWebContents(tab) } catch {}
      const c = win ? windows.get(win) : null
      if (c) sendUi(c, 'close-tab-by-wc', tab.id)
    },
  })
  ElectronChromeExtensions.handleCRXProtocol(session.defaultSession)
}

function registerTab(wc) {
  if (!extEngine) return
  try {
    if (wc.session !== session.defaultSession) return
  } catch {
    return
  }
  const win = BrowserWindow.fromWebContents(wc)
  extEngine.addTab(wc, win)
  if (pendingExtCreate.length) {
    const resolve = pendingExtCreate.shift()
    resolve([wc, win])
  }
}

function fileUrl(p) {
  return 'file://' + path.resolve(p).replace(/\\/g, '/')
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function ctxFor(event) {
  const win = BrowserWindow.fromWebContents(event.sender)
  return windows.get(win) || null
}

function ctxForWc(wc) {
  const win = BrowserWindow.fromWebContents(wc)
  return windows.get(win) || null
}

function ui(ctx) {
  return ctx.win ? ctx.win.webContents : null
}

function activeWc(ctx) {
  return ctx.activeWcId ? webContents.fromId(ctx.activeWcId) : null
}

function broadcastDownloads() {
  for (const ctx of windows.values()) {
    const t = ui(ctx)
    if (t && !t.isDestroyed()) t.send('downloads-updated', store.downloads())
  }
}

function broadcastSettings() {
  const s = settingsForUi()
  for (const ctx of windows.values()) {
    const t = ui(ctx)
    if (t && !t.isDestroyed()) t.send('settings-updated', s)
  }
}

function settingsForUi() {
  const s = { ...store.settings() }
  s.aiApiKey = store.decryptSecret(s.aiApiKey)
  return s
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

function sendUi(ctx, action, data) {
  const t = ui(ctx)
  if (t && !t.isDestroyed()) t.send('ui-action', action, data)
}

async function loadExtensionFolder(dir) {
  try {
    const loaded = await session.defaultSession.loadExtension(dir)
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
    const rec = { id: loaded.id, name: manifest.name || 'Extensión', version: manifest.version || '1.0', contentScripts: [], folder: dir }
    store.addExtension(rec)
    return rec
  } catch (e) {
    return { error: String((e && e.message) || e) }
  }
}

async function rehydrateExtensions() {
  for (const ext of store.listExtensions()) {
    if (ext.enabled && ext.folder) {
      try {
        await session.defaultSession.loadExtension(ext.folder)
      } catch {}
    }
  }
}

function crxZipOffset(buf) {
  if (buf.length < 12 || buf[0] !== 0x43 || buf[1] !== 0x72 || buf[2] !== 0x32 || buf[3] !== 0x34) return -1
  const version = buf.readUInt32LE(4)
  if (version === 2) {
    const keyLen = buf.readUInt32LE(8)
    const sigLen = buf.readUInt32LE(12)
    return 16 + keyLen + sigLen
  }
  if (version === 3) {
    const headerSize = buf.readUInt32LE(8)
    return 12 + headerSize
  }
  return -1
}

async function installExtensionFromStore(storeId) {
  const id = String(storeId || '').trim().toLowerCase().match(/[a-z]{32}/)
  if (!id) return { error: 'ID no válido (deben ser 32 caracteres a-z). Pega la URL de la extensión de Chrome Web Store.' }
  const extId = id[0]
  const url = 'https://clients2.google.com/service/update2/crx?response=redirect&prodversion=91.0.4472.124&x=id%3D' + extId + '%26installsource%3Dondemand%26uc'
  try {
    const res = await net.fetch(url)
    if (!res.ok) return { error: 'No se pudo descargar (HTTP ' + res.status + ')' }
    const buf = Buffer.from(await res.arrayBuffer())
    const zipStart = crxZipOffset(buf)
    if (zipStart < 0) return { error: 'El archivo descargado no es una extensión .crx válida' }
    const dir = path.join(app.getPath('userData'), 'extensions-crx', extId)
    fs.mkdirSync(dir, { recursive: true })
    new AdmZip(buf.subarray(zipStart)).extractAllTo(dir, true)
    const ext = await loadExtensionFolder(dir)
    if (ext && ext.error) return { error: 'Se descargó pero falló al cargar: ' + ext.error }
    return ext
  } catch (e) {
    return { error: 'Error de red: ' + (e && e.message) }
  }
}

const extStorage = new Map()

async function extStorageGet(keys) {
  if (keys === null || keys === undefined) {
    return Object.fromEntries(extStorage)
  }
  if (typeof keys === 'string') {
    return extStorage.has(keys) ? { [keys]: extStorage.get(keys) } : {}
  }
  const out = {}
  if (Array.isArray(keys)) {
    for (const k of keys) if (extStorage.has(k)) out[k] = extStorage.get(k)
  } else if (typeof keys === 'object') {
    for (const [k, def] of Object.entries(keys)) out[k] = extStorage.has(k) ? extStorage.get(k) : def
  }
  return out
}

function extStorageSet(items) {
  for (const [k, v] of Object.entries(items || {})) extStorage.set(k, v)
}

function currentCtx() {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0]
  return windows.get(win) || null
}

function scheduleSessionSave() {
  if (scheduleSessionSave._t) return
  scheduleSessionSave._t = setTimeout(() => {
    scheduleSessionSave._t = null
  }, 3000)
}

function createWindow({ incognito = false } = {}) {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    backgroundColor: '#141414',
    title: 'Nixer Browser',
    frame: false,
    show: false,
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
  const ctx = { id: nextWindowId++, win, incognito, activeWcId: null }
  windows.set(win, ctx)

  if (app.isPackaged) win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  else win.loadURL(DEV_SERVER_URL)
  win.webContents.on('did-fail-load', (_e, code) => {
    if (!app.isPackaged && (code === -105 || code === -102)) {
      win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
    }
  })
  win.webContents.on('did-finish-load', () => {
    if (!win.isDestroyed() && process.env.SMOKE !== '1') win.show()
  })

  win.on('maximize', () => { const t = ui(ctx); if (t && !t.isDestroyed()) t.send('win-maximized', true) })
  win.on('unmaximize', () => { const t = ui(ctx); if (t && !t.isDestroyed()) t.send('win-maximized', false) })
  win.on('closed', () => {
    windows.delete(win)
    if (incognito) {
      const ses = session.fromPartition(PRIVATE_PARTITION)
      try { ses.clearStorageData() } catch {}
      try { ses.clearCache() } catch {}
    }
  })
  return ctx
}

async function savePageOf(wc) {
  if (!wc) return
  const url = wc.getURL()
  if (!url || !url.startsWith('http')) return
  const win = BrowserWindow.fromWebContents(wc)
  const name = (wc.getTitle() || 'pagina').replace(/[\\/:*?"<>|]/g, '').slice(0, 80) + '.html'
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: name,
    filters: [{ name: 'Página HTML', extensions: ['html'] }],
  })
  if (canceled || !filePath) return
  wc.savePage(filePath, 'HTMLComplete').catch(() => {})
}

async function saveAsUrl(win, url) {
  if (!url) return
  const name = url.split('/').pop().split('?')[0] || 'descarga'
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: decodeURIComponent(name),
    filters: [{ name: 'Todos los archivos', extensions: ['*'] }],
  })
  if (canceled || !filePath) return
  pendingSaveUrls.set(url, filePath)
  session.defaultSession.downloadURL(url)
}

const readers = new Map()

async function extractReader(wc) {
  try {
    const res = await wc.executeJavaScript(`(() => {
      const clone = document.body.cloneNode(true)
      clone.querySelectorAll('script, style, iframe, nav, header, footer, aside, form, noscript, svg').forEach(n => n.remove())
      let best = null
      let bestLen = 0
      const walker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT)
      while (walker.nextNode()) {
        const n = walker.currentNode
        const len = n.textContent.trim().length
        if (len > bestLen && n.querySelectorAll('p').length >= 2) { bestLen = len; best = n }
      }
      const text = best ? best.textContent.replace(/\\s+/g, ' ').trim() : document.body.innerText.replace(/\\s+/g, ' ').trim()
      return { title: document.title || '', url: location.href, text: text.slice(0, 150000) }
    })()`)
    const id = Date.now() + '-' + Math.floor(Math.random() * 1e5)
    readers.set(id, res)
    setTimeout(() => readers.delete(id), 120000)
    return id
  } catch {
    return null
  }
}

function showContentMenu(ctx, wc, params) {
  const template = []
  if (params.linkURL) {
    template.push({ label: 'Abrir enlace en pestaña nueva', click: () => sendUi(ctx, 'open-tab', params.linkURL) })
    template.push({ label: 'Abrir enlace en ventana de incógnito', click: () => { const c2 = createWindow({ incognito: true }); setTimeout(() => sendUi(c2, 'open-tab', params.linkURL), 900) } })
    template.push({ label: 'Copiar dirección del enlace', click: () => { if (wc) wc.copy(params.linkURL) } })
    template.push({ type: 'separator' })
  }
  if (params.isEditable) {
    template.push({ label: 'Cortar', role: 'cut' }, { label: 'Copiar', role: 'copy' }, { label: 'Pegar', role: 'paste' }, { label: 'Seleccionar todo', role: 'selectAll' })
    template.push({ type: 'separator' })
  }
  if (params.selectionText) {
    template.push({ label: 'Buscar: "' + params.selectionText.slice(0, 40) + '"', click: () => sendUi(ctx, 'open-tab', store.searchUrl(params.selectionText)) })
    template.push({ label: 'Copiar', role: 'copy' })
    template.push({ type: 'separator' })
  }
  template.push(
    { label: 'Atrás', click: () => { if (wc && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack() } },
    { label: 'Adelante', click: () => { if (wc && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward() } },
    { label: 'Recargar', click: () => wc && wc.reload() }
  )
  template.push({ type: 'separator' })
  if (params.mediaType === 'image') {
    template.push({ label: 'Guardar imagen como…', click: () => saveAsUrl(BrowserWindow.fromWebContents(wc), params.srcURL) })
    template.push({ label: 'Copiar dirección de la imagen', click: () => { if (wc) wc.copy(params.srcURL) } })
    template.push({ label: 'Abrir imagen en pestaña nueva', click: () => sendUi(ctx, 'open-tab', params.srcURL) })
    template.push({ type: 'separator' })
  }
  if (params.linkURL) {
    template.push({ label: 'Guardar enlace como…', click: () => saveAsUrl(BrowserWindow.fromWebContents(wc), params.linkURL) })
    template.push({ type: 'separator' })
  }
  template.push({ label: 'Guardar página como…', click: () => savePageOf(wc) })
  template.push({ label: 'Imprimir', click: () => wc && wc.print({ silent: false, printBackground: true }) })
  template.push({
    label: 'Capturar pantalla',
    click: async () => { const f = await captureScreenshot(wc); if (f) console.log('SCREENSHOT_SAVED', f) },
  })
  template.push({ label: 'Picture-in-Picture', click: () => togglePip(wc) })
  template.push({
    label: 'Modo lectura',
    click: async () => {
      const id = await extractReader(wc)
      if (id) sendUi(ctx, 'open-reader', id)
    },
  })
  template.push({ type: 'separator' })
  template.push({ label: 'Inspeccionar elemento', click: () => wc && wc.openDevTools() })
  const win = BrowserWindow.fromWebContents(wc)
  if (win) Menu.buildFromTemplate(template).popup({ window: win })
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

function buildMenu() {
  const act = (action, data) => { const c = currentCtx(); if (c) sendUi(c, action, data) }
  const wc = () => { const c = currentCtx(); return c ? activeWc(c) : null }
  const template = [
    {
      label: 'Archivo',
      submenu: [
        { label: 'Nueva pestaña', accelerator: 'CmdOrCtrl+T', click: () => act('new-tab') },
        { label: 'Nueva ventana', accelerator: 'CmdOrCtrl+N', click: () => createWindow() },
        { label: 'Nueva ventana de incógnito', accelerator: 'CmdOrCtrl+Shift+N', click: () => createWindow({ incognito: true }) },
        { type: 'separator' },
        { label: 'Cerrar pestaña', accelerator: 'CmdOrCtrl+W', click: () => act('close-tab') },
        { label: 'Reabrir pestaña cerrada', accelerator: 'CmdOrCtrl+Shift+T', click: () => act('restore-tab') },
        { label: 'Cerrar ventana', accelerator: 'CmdOrCtrl+Shift+W', click: () => { const w = BrowserWindow.getFocusedWindow(); if (w) w.close() } },
        { type: 'separator' },
        { label: 'Imprimir', accelerator: 'CmdOrCtrl+P', click: () => { const w = wc(); if (w) w.print({ silent: false, printBackground: true }) } },
        { label: 'Guardar página como…', accelerator: 'CmdOrCtrl+S', click: () => savePageOf(wc()) },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { label: 'Atrás', accelerator: 'Alt+Left', click: () => { const w = wc(); if (w && w.navigationHistory.canGoBack()) w.navigationHistory.goBack() } },
        { label: 'Adelante', accelerator: 'Alt+Right', click: () => { const w = wc(); if (w && w.navigationHistory.canGoForward()) w.navigationHistory.goForward() } },
        { label: 'Inicio', accelerator: 'Alt+Home', click: () => act('home') },
        { type: 'separator' },
        { label: 'Recargar', accelerator: 'CmdOrCtrl+R', click: () => { const w = wc(); if (w) w.reload() } },
        { label: 'Recargar sin caché', accelerator: 'CmdOrCtrl+Shift+R', click: () => { const w = wc(); if (w) w.reloadIgnoringCache() } },
        { label: 'Detener', accelerator: 'Esc', click: () => { const w = wc(); if (w) w.stop() } },
        { type: 'separator' },
        { label: 'Acercar', accelerator: 'CmdOrCtrl+=', click: () => { const w = wc(); if (w) w.setZoomFactor(Math.min(3, (w.getZoomFactor() || 1) + 0.1)) } },
        { label: 'Alejar', accelerator: 'CmdOrCtrl+-', click: () => { const w = wc(); if (w) w.setZoomFactor(Math.max(0.25, (w.getZoomFactor() || 1) - 0.1)) } },
        { label: 'Restablecer zoom', accelerator: 'CmdOrCtrl+0', click: () => { const w = wc(); if (w) w.setZoomFactor(1) } },
        { type: 'separator' },
        { label: 'Pantalla completa', accelerator: 'F11', click: () => { const w = BrowserWindow.getFocusedWindow(); if (w) w.setFullScreen(!w.isFullScreen()) } },
        { label: 'Buscar en página', accelerator: 'CmdOrCtrl+F', click: () => act('open-find') },
        { label: 'Paleta de comandos', accelerator: 'CmdOrCtrl+Shift+P', click: () => act('open-palette') },
        { label: 'Barra de direcciones', accelerator: 'CmdOrCtrl+L', click: () => act('focus-address') },
        { label: 'Herramientas de desarrollo', accelerator: 'F12', click: () => { const w = wc(); if (w) w.openDevTools() } },
        { type: 'separator' },
        { label: 'Modo lectura', accelerator: 'CmdOrCtrl+Shift+M', click: async () => { const w = wc(); const id = await extractReader(w); if (id) act('open-reader', id) } },
        { label: 'Administrador de tareas', accelerator: 'Shift+Esc', click: () => act('open-taskmanager') },
        { type: 'separator' },
        { label: 'Capturar pantalla', accelerator: 'CmdOrCtrl+Shift+S', click: async () => { const f = await captureScreenshot(wc()); if (f) act('ui-toast', { text: 'Captura guardada en ' + f, kind: 'ok' }) } },
        { label: 'Picture-in-Picture', click: () => togglePip(wc()) },
      ],
    },
    {
      label: 'Ayuda',
      submenu: [
        { label: 'Acerca de Nixer Browser', accelerator: 'F1', click: () => act('open-page', 'about') },
      ],
    },
    {
      label: 'Historial',
      submenu: [
        { label: 'Página anterior', accelerator: 'CmdOrCtrl+[', click: () => { const w = wc(); if (w && w.navigationHistory.canGoBack()) w.navigationHistory.goBack() } },
        { label: 'Página siguiente', accelerator: 'CmdOrCtrl+]', click: () => { const w = wc(); if (w && w.navigationHistory.canGoForward()) w.navigationHistory.goForward() } },
        { label: 'Inicio', click: () => act('home') },
        { type: 'separator' },
        { label: 'Pestaña siguiente', accelerator: 'CmdOrCtrl+Tab', click: () => act('cycle-tab', 1) },
        { label: 'Pestaña anterior', accelerator: 'CmdOrCtrl+Shift+Tab', click: () => act('cycle-tab', -1) },
        { type: 'separator' },
        { label: 'Gestionar historial', accelerator: 'CmdOrCtrl+H', click: () => act('open-page', 'history') },
      ],
    },
    {
      label: 'Marcadores',
      submenu: [
        { label: 'Añadir esta página', accelerator: 'CmdOrCtrl+D', click: () => act('bookmark-page') },
        { label: 'Gestionar marcadores', accelerator: 'CmdOrCtrl+Shift+O', click: () => act('open-page', 'bookmarks') },
        { type: 'separator' },
        {
          label: 'Mostrar barra de marcadores',
          type: 'checkbox',
          checked: store.settings().showBookmarksBar,
          click: (item) => {
            store.setSettings({ showBookmarksBar: item.checked })
            broadcastSettings()
          },
        },
      ],
    },
    {
      label: 'IA',
      submenu: [
        { label: 'Chat con IA', accelerator: 'CmdOrCtrl+Alt+A', click: () => act('open-page', 'ai') },
        { label: 'Configurar IA', click: () => act('open-page', 'settings') },
      ],
    },
    {
      label: 'Ajustes',
      submenu: [
        { label: 'Ajustes', accelerator: 'CmdOrCtrl+,', click: () => act('open-page', 'settings') },
        { label: 'Descargas', accelerator: 'CmdOrCtrl+J', click: () => act('open-page', 'downloads') },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function guardState(origin) {
  const s = store.settings()
  const shields = (s.siteShields && s.siteShields[origin]) || {}
  return {
    blockAds: shields.blockAds !== undefined ? shields.blockAds : s.blockAds,
    blockScripts: shields.blockScripts !== undefined ? shields.blockScripts : s.blockScripts,
    blockThirdPartyCookies: shields.blockCookies !== undefined ? shields.blockCookies : s.blockThirdPartyCookies,
    sendDnt: s.sendDnt,
    httpsUpgrade: s.httpsUpgrade,
  }
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
    const c = windows.get(win)
    const target = c && ui(c)
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

const pendingSaveUrls = new Map()

function initDownloads() {
  session.defaultSession.on('will-download', (_e, item) => {
    const url = item.getURL()
    const isCrx = item.getFilename().toLowerCase().endsWith('.crx') && /(chromewebstore|google\.com)/.test(url)
    if (isCrx) {
      item.cancel()
      const idMatch = url.match(/id%3D([a-z]{32})/i) || url.match(/[a-z]{32}/)
      if (idMatch) installExtensionFromStore(idMatch[1]).then((res) => {
        const c = currentCtx()
        if (c) sendUi(c, 'ui-toast', { text: res && res.error ? 'Error al instalar: ' + res.error : 'Extensión instalada desde Chrome Web Store', kind: res && res.error ? 'error' : 'ok' })
      })
      return
    }
    const forced = pendingSaveUrls.get(url)
    if (forced) {
      item.setSavePath(forced)
      pendingSaveUrls.delete(url)
    }
    const rec = {
      id: item.getURL(),
      name: item.getFilename(),
      url: item.getURL(),
      path: item.getSavePath(),
      received: 0,
      total: item.getTotalBytes(),
      state: 'in-progress',
    }
    store.upsertDownload(rec)
    broadcastDownloads()
    item.on('updated', () => {
      rec.received = item.getReceivedBytes()
      rec.total = item.getTotalBytes()
      broadcastDownloads()
    })
    item.on('done', (_e2, state) => {
      rec.state = state === 'completed' ? 'completed' : 'cancelled'
      rec.path = item.getSavePath()
      broadcastDownloads()
    })
  })
}

function regAdd(args) {
  return new Promise((resolve) => {
    execFile('reg', ['add', ...args, '/f'], { windowsHide: true }, (err) => resolve(!err))
  })
}

async function registerAsDefaultBrowser() {
  const exe = process.execPath
  const quoted = '"' + exe + '" "%1"'
  const base = 'HKCU\\Software\\Clients\\StartMenuInternet\\NixerBrowser'
  const steps = [
    ['HKCU\\Software\\RegisteredApplications', '/v', 'Nixer Browser', '/t', 'REG_SZ', '/d', 'Software\\Clients\\StartMenuInternet\\NixerBrowser\\Capabilities'],
    [base + '\\Capabilities', '/ve', '/d', 'Nixer Browser'],
    [base + '\\Capabilities', '/v', 'ApplicationName', '/t', 'REG_SZ', '/d', 'Nixer Browser'],
    [base + '\\Capabilities', '/v', 'ApplicationDescription', '/t', 'REG_SZ', '/d', 'Navegador basado en Chromium con interfaz en React'],
    [base + '\\Capabilities', '/v', 'ApplicationIcon', '/t', 'REG_SZ', '/d', '"' + exe + '",0'],
    [base + '\\Capabilities\\URLAssociations', '/v', 'http', '/t', 'REG_SZ', '/d', 'NixerBrowser.http'],
    [base + '\\Capabilities\\URLAssociations', '/v', 'https', '/t', 'REG_SZ', '/d', 'NixerBrowser.https'],
    [base + '\\Capabilities\\URLAssociations', '/v', 'mailto', '/t', 'REG_SZ', '/d', 'NixerBrowser.mailto'],
    [base + '\\Capabilities\\Application', '/v', 'ApplicationName', '/t', 'REG_SZ', '/d', 'Nixer Browser'],
    [base + '\\Capabilities\\Application', '/v', 'ApplicationDescription', '/t', 'REG_SZ', '/d', 'Navegador basado en Chromium con interfaz en React'],
    [base + '\\Capabilities\\Application', '/v', 'AppUserModelID', '/t', 'REG_SZ', '/d', 'com.nixer.browser'],
    [base + '\\Capabilities\\DefaultIcon', '/ve', '/d', '"' + exe + '",0'],
    [base + '\\shell\\open\\command', '/ve', '/d', '"' + exe + '"'],
    [base + '\\DefaultIcon', '/ve', '/d', '"' + exe + '",0'],
    ['HKCU\\Software\\Classes\\NixerBrowser.http\\shell\\open\\command', '/ve', '/d', quoted],
    ['HKCU\\Software\\Classes\\NixerBrowser.https\\shell\\open\\command', '/ve', '/d', quoted],
    ['HKCU\\Software\\Classes\\NixerBrowser.mailto\\shell\\open\\command', '/ve', '/d', quoted],
    ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Nixer Browser.exe', '/ve', '/d', exe],
  ]
  const results = []
  for (const s of steps) results.push(await regAdd(s))
  return results.every(Boolean)
}

function isHttpDefault() {
  return new Promise((resolve) => {
    execFile('reg', ['query', 'HKCU\\Software\\Classes\\http\\shell\\open\\command', '/ve'], { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve(false)
      const name = path.basename(process.execPath).toLowerCase()
      const lower = String(stdout).toLowerCase()
      resolve(lower.includes(name) || lower.includes('nixerbrowser.http'))
    })
  })
}

async function forceProtocolAssociations() {
  const exe = process.execPath
  const quoted = '"' + exe + '" "%1"'
  const steps = [
    ['HKCU\\Software\\Classes\\http\\shell\\open\\command', '/ve', '/d', quoted],
    ['HKCU\\Software\\Classes\\https\\shell\\open\\command', '/ve', '/d', quoted],
    ['HKCU\\Software\\Classes\\ftp\\shell\\open\\command', '/ve', '/d', quoted],
    ['HKCU\\Software\\Classes\\mailto\\shell\\open\\command', '/ve', '/d', quoted],
  ]
  const results = []
  for (const s of steps) results.push(await regAdd(s))
  return results.every(Boolean)
}

function userChoiceHash(progId, sid) {
  const keyBytes = Buffer.from('A4A120A58017F64FBD18167343C5AF16', 'hex')
  const msg = Buffer.from(progId + sid, 'utf16le')
  return crypto.createHmac('sha256', keyBytes).update(msg).digest('base64')
}

function currentSid() {
  return new Promise((resolve) => {
    execFile('whoami', ['/user'], { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve(null)
      const m = /(S-\d+(-\d+)+)/.exec(stdout)
      resolve(m ? m[1] : null)
    })
  })
}

async function writeUserChoice() {
  const sid = await currentSid()
  if (!sid) return false
  const pairs = [
    ['http', 'NixerBrowser.http'],
    ['https', 'NixerBrowser.https'],
    ['mailto', 'NixerBrowser.mailto'],
  ]
  let allOk = true
  for (const [proto, progId] of pairs) {
    const key = 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\' + proto + '\\UserChoice'
    const ok1 = await regAdd([key, '/v', 'ProgId', '/t', 'REG_SZ', '/d', progId])
    const ok2 = await regAdd([key, '/v', 'Hash', '/t', 'REG_SZ', '/d', userChoiceHash(progId, sid)])
    allOk = allOk && ok1 && ok2
  }
  return allOk
}

function registerIpc() {
  ipcMain.on('win-minimize', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.minimize() })
  ipcMain.on('win-toggle-maximize', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) { if (w.isMaximized()) w.unmaximize(); else w.maximize() } })
  ipcMain.on('win-close', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.close() })
  ipcMain.on('toggle-fullscreen', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.setFullScreen(!w.isFullScreen()) })
  ipcMain.on('create-window', (e, incognito) => createWindow({ incognito: !!incognito }))
  ipcMain.handle('reader:get', (_e, id) => readers.get(id) || null)

  ipcMain.handle('view-info', () => {
    return {
      preload: 'file://' + path.join(__dirname, 'view-preload.js').replace(/\\/g, '/'),
      newtab: 'nixer://newtab',
      welcome: 'nixer://welcome',
      pages: 'nixer://pages/',
    }
  })
  ipcMain.handle('window-info', (e) => {
    const c = ctxFor(e)
    return c ? { incognito: c.incognito } : { incognito: false }
  })
  ipcMain.on('set-active-wc', (e, wcId) => {
    const c = ctxFor(e)
    if (c) c.activeWcId = Number(wcId) || null
    if (extEngine && wcId) {
      const w = webContents.fromId(Number(wcId))
      if (w && w.session === session.defaultSession) extEngine.selectTab(w)
    }
  })
  ipcMain.on('add-history', (e, entry) => {
    const c = ctxFor(e)
    if (!c) return
    store.addHistory({ url: entry.url, title: entry.title, ts: Date.now() })
  })

  ipcMain.on('history:update-title', (_e, url, title) => {
    if (url && title) store.updateHistoryTitle(url, title)
  })

  ipcMain.on('create-tab', (e, url) => {
    const c = ctxFor(e)
    if (c) sendUi(c, 'open-tab', url || '')
  })

  ipcMain.on('login-submit', (e, cred) => {
    const c = ctxFor(e)
    if (!c || c.incognito) return
    const target = c && ui(c)
    if (target && cred && cred.origin && !store.hasPassword(cred.origin)) {
      target.send('save-password-prompt', cred)
    }
  })
  ipcMain.on('password-save', (e, cred) => { const c = ctxFor(e); if (cred && (!c || !c.incognito)) store.addPassword(cred) })
  ipcMain.on('autofill-request', (e, payload) => {
    const cred = payload && payload.origin ? store.getPassword(payload.origin) : null
    e.sender.send('autofill-response', cred)
  })
  ipcMain.on('autofill-form', (e) => {
    const c = ctxFor(e)
    const w = c && activeWc(c)
    if (!w) return
    const p = store.settings().autofillProfile || {}
    const data = { name: p.name || '', email: p.email || '', phone: p.phone || '', company: p.company || '', address: p.address || '', city: p.city || '', zip: p.zip || '' }
    w.executeJavaScript(`(() => {
      const data = ${JSON.stringify(data)}
      const KEYWORDS = { name: ['name','nombre','nombre'], email: ['email','mail','correo'], phone: ['phone','tel','telefono','movil'], company: ['company','empresa','organizacion'], address: ['address','direccion','street','calle'], city: ['city','ciudad','poblacion'], zip: ['zip','postal','cp'] }
      const inputs = Array.from(document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input[type="number"]'))
      const used = new Set()
      for (const [key, val] of Object.entries(data)) {
        if (!val) continue
        const kw = KEYWORDS[key] || []
        let el = null
        for (const k of kw) {
          el = inputs.find(i => !used.has(i) && !i.value && ((i.name || '').toLowerCase().includes(k) || (i.id || '').toLowerCase().includes(k) || (i.getAttribute('autocomplete') || '').toLowerCase().includes(k)))
          if (el) break
        }
        if (el) { el.value = val; used.add(el) }
      }
      used.forEach(i => i.dispatchEvent(new Event('input', { bubbles: true })))
    })()`).catch(() => {})
  })
  ipcMain.handle('passwords:list', () => store.listPasswords())
  ipcMain.handle('passwords:add', (_e, p) => store.addPassword(p))
  ipcMain.handle('passwords:remove', (_e, id) => store.removePassword(id))

  ipcMain.on('content-scripts', (e, payload) => {
    e.sender.send('content-scripts-result', store.contentScriptsFor((payload && payload.url) || ''))
  })
  ipcMain.handle('extensions:list', () => {
    const sesExts = session.defaultSession.getAllExtensions()
    return store.listExtensions().map((rec) => {
      const sesExt = sesExts.find((e) => e.id === rec.id || (rec.folder && e.path === rec.folder)) || null
      let icon = null
      let optionsUrl = null
      let homepage = null
      let manifest = null
      try { manifest = JSON.parse(fs.readFileSync(path.join(rec.folder, 'manifest.json'), 'utf8')) } catch {}
      if (manifest) {
        const icons = manifest.icons || {}
        const size = ['128', '48', '32', '16'].find((s) => icons[s]) || Object.keys(icons)[0]
        if (size && icons[size]) {
          try {
            const p = path.join(rec.folder, icons[size])
            const ext = path.extname(p).toLowerCase()
            const mime = ext === '.svg' ? 'image/svg+xml' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png'
            icon = 'data:' + mime + ';base64,' + fs.readFileSync(p).toString('base64')
          } catch {}
        }
        if (manifest.options_page) optionsUrl = manifest.options_page
        else if (manifest.options_ui && manifest.options_ui.page) optionsUrl = manifest.options_ui.page
        homepage = manifest.homepage_url || null
      }
      return {
        id: rec.id,
        name: rec.name,
        version: rec.version,
        enabled: !!rec.enabled,
        contentScripts: (rec.contentScripts || []).length,
        folder: rec.folder || null,
        icon,
        optionsUrl,
        homepage,
        extensionId: sesExt ? sesExt.id : null,
      }
    })
  })
  ipcMain.handle('extensions:remove', async (_e, id) => {
    const ext = store.listExtensions().find((x) => x.id === id)
    const sesExt = ext && session.defaultSession.getAllExtensions().find((e) => e.id === ext.id || (ext.folder && e.path === ext.folder))
    if (sesExt) {
      try { session.defaultSession.removeExtension(sesExt.id) } catch {}
    }
    store.removeExtension(id)
  })
  ipcMain.handle('extensions:set-enabled', async (_e, id, enabled) => {
    const ext = store.listExtensions().find((x) => x.id === id)
    if (ext) {
      try {
        if (enabled) await session.defaultSession.loadExtension(ext.folder)
        else {
          const sesExt = session.defaultSession.getAllExtensions().find((e) => e.id === ext.id || (ext.folder && e.path === ext.folder))
          if (sesExt) session.defaultSession.removeExtension(sesExt.id)
        }
      } catch {}
    }
    store.setExtensionEnabled(id, enabled)
  })
  ipcMain.handle('extensions:open-options', (_e, id) => {
    const ext = store.listExtensions().find((x) => x.id === id)
    if (!ext) return false
    let manifest = null
    try { manifest = JSON.parse(fs.readFileSync(path.join(ext.folder, 'manifest.json'), 'utf8')) } catch {}
    const page = manifest && (manifest.options_page || (manifest.options_ui && manifest.options_ui.page))
    if (!page) return false
    const sesExt = session.defaultSession.getAllExtensions().find((e) => e.id === ext.id || (ext.folder && e.path === ext.folder))
    const c = currentCtx()
    if (sesExt && c) { sendUi(c, 'open-tab', 'chrome-extension://' + sesExt.id + '/' + page); return true }
    return false
  })
  ipcMain.handle('extensions:open-homepage', (_e, id) => {
    const ext = store.listExtensions().find((x) => x.id === id)
    if (!ext) return false
    let manifest = null
    try { manifest = JSON.parse(fs.readFileSync(path.join(ext.folder, 'manifest.json'), 'utf8')) } catch {}
    if (!manifest || !manifest.homepage_url) return false
    const c = currentCtx()
    if (c) { sendUi(c, 'open-tab', manifest.homepage_url); return true }
    return false
  })
  ipcMain.handle('extensions:load', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: 'Selecciona la carpeta de la extensión' })
    if (canceled || !filePaths || !filePaths[0]) return null
    return loadExtensionFolder(filePaths[0])
  })
  ipcMain.handle('extensions:install-store', (_e, storeId) => installExtensionFromStore(storeId))
  ipcMain.handle('ext-storage-get', (_e, keys) => extStorageGet(keys))
  ipcMain.handle('ext-storage-set', (_e, items) => { extStorageSet(items); return true })

  ipcMain.handle('set-default-browser', async () => {
    let regOk = false
    try { regOk = await registerAsDefaultBrowser() } catch (e) { console.log('DEFAULT_REG_ERR', e && e.message) }
    let forceOk = false
    try { forceOk = await forceProtocolAssociations() } catch (e) { console.log('DEFAULT_FORCE_ERR', e && e.message) }
    let choiceOk = false
    try { choiceOk = await writeUserChoice() } catch (e) { console.log('DEFAULT_CHOICE_ERR', e && e.message) }
    try { app.setAsDefaultProtocolClient('http') } catch {}
    try { app.setAsDefaultProtocolClient('https') } catch {}
    try { shell.openExternal('ms-settings:defaultapps') } catch (e) { console.log('DEFAULT_OPEN_ERR', e && e.message) }
    console.log('DEFAULT_REGISTERED regOk=' + regOk + ' forceOk=' + forceOk + ' choiceOk=' + choiceOk)
    return regOk || forceOk
  })
  ipcMain.handle('is-default-browser', async () => {
    if (app.isDefaultProtocolClient('http')) return true
    return isHttpDefault()
  })
  ipcMain.on('save-session', (e, urls) => {
    const c = ctxFor(e)
    if (c && c.incognito) return
    store.saveSession((urls || []).map((u) => ({ url: u.url, pinned: !!u.pinned })))
  })
  ipcMain.handle('get-session', () => store.session())
  ipcMain.handle('get-url-overrides', () => (extEngine && extEngine.getURLOverrides()) || {})

  ipcMain.on('permission-response', (e, payload) => {
    const pending = pendingPermits.get(payload && payload.id)
    if (!pending) return
    pendingPermits.delete(payload.id)
    try { pending.cb(!!payload.allow) } catch {}
    if (payload.remember) {
      const s = store.settings()
      s.sitePermissions = s.sitePermissions || {}
      s.sitePermissions[pending.origin] = s.sitePermissions[pending.origin] || {}
      s.sitePermissions[pending.origin][pending.permission] = !!payload.allow
      store.setSettings({ sitePermissions: s.sitePermissions })
      broadcastSettings()
    }
  })

  ipcMain.handle('save-page', (e) => { const c = ctxFor(e); if (c) savePageOf(activeWc(c)) })
  ipcMain.handle('print-wc', (e) => { const c = ctxFor(e); const w = c && activeWc(c); if (w) w.print({ silent: false, printBackground: true }) })
  ipcMain.handle('app:info', () => appInfo())
  ipcMain.handle('screenshot', async (e) => { const c = ctxFor(e); const w = c && activeWc(c); return captureScreenshot(w) })
  ipcMain.handle('pip', (e) => { const c = ctxFor(e); togglePip(c && activeWc(c)); return true })
  ipcMain.handle('safe:allow', (_e, host) => { if (host) SB_CACHE.delete(host); return true })
  ipcMain.handle('save-as', async (e, url) => { const c = ctxFor(e); if (c) await saveAsUrl(c.win, url) })
  ipcMain.handle('reader-mode', async (e) => { const c = ctxFor(e); return extractReader(activeWc(c)) })

  ipcMain.handle('taskmanager:list', async () => {
    const rows = []
    let total = 0
    for (const wc of webContents.getAllWebContents()) {
      if (wc.getType() !== 'webview') continue
      let mem = 0
      try {
        const pid = wc.getOSProcessId()
        if (pid) {
          const info = await process.getProcessMemoryInfo(pid)
          mem = info.workingSetSize
        }
      } catch {}
      rows.push({ id: wc.id, title: wc.getTitle() || 'Página', url: wc.getURL(), mem })
      total += mem
    }
    return { rows, total }
  })

  ipcMain.handle('autocomplete:query', (_e, q) => autocompleteQuery(q))
  ipcMain.handle('bookmarks:list', () => store.listBookmarks())
  ipcMain.handle('bookmarks:add', (_e, b) => store.addBookmark(b))
  ipcMain.handle('bookmarks:remove', (_e, id) => store.removeBookmark(id))
  ipcMain.handle('bookmarks:update', (_e, id, patch) => store.updateBookmark(id, patch))
  ipcMain.handle('bookmarks:export', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: 'marcadores.html',
      filters: [{ name: 'HTML', extensions: ['html'] }],
    })
    if (canceled || !filePath) return false
    const rows = store
      .listBookmarks()
      .map((b) => `    <DT><A HREF="${escapeHtml(b.url)}">${escapeHtml(b.title || b.url)}</A>` + (b.folder ? ` [${escapeHtml(b.folder)}]` : '') + `</DT>`)
      .join('\n')
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Marcadores</TITLE>\n<H1>Marcadores</H1>\n<DL><p>\n${rows}\n</DL><p>\n`
    fs.writeFileSync(filePath, html, 'utf8')
    return true
  })
  ipcMain.handle('bookmarks:import', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'HTML', extensions: ['html'] }] })
    if (canceled || !filePaths || !filePaths[0]) return 0
    const html = fs.readFileSync(filePaths[0], 'utf8')
    const links = [...html.matchAll(/<A\s+HREF=["']([^"']+)["'][^>]*>([^<]*)<\/A>/gi)]
    let folder = ''
    let count = 0
    for (const m of links) {
      const url = m[1]
      if (!url || !/^https?:\/\//.test(url)) continue
      const title = (m[2] || '').trim()
      store.addBookmark({ url, title: title || url, folder })
      count++
    }
    return count
  })
  ipcMain.handle('bookmarks:clear', () => { const ids = store.listBookmarks().map((b) => b.id); ids.forEach((id) => store.removeBookmark(id)) })
  ipcMain.handle('bookmarks:is-bookmarked', (_e, url) => store.isBookmarked(url))
  ipcMain.handle('history:list', (_e, q) => store.searchHistory(q, 200))
  ipcMain.handle('history:clear', () => store.clearHistory())
  ipcMain.handle('history:remove', (_e, url) => store.removeHistory(url))
  ipcMain.handle('downloads:list', () => store.downloads())
  ipcMain.handle('downloads:clear', () => { store.clearDownloads(); broadcastDownloads() })
  ipcMain.handle('settings:get', () => settingsForUi())
  ipcMain.handle('settings:defaults', () => store.settingsDefaults())
  ipcMain.handle('settings:set', (_e, patch) => {
    if (patch && typeof patch.aiApiKey === 'string' && patch.aiApiKey) {
      patch = { ...patch, aiApiKey: store.encryptSecret(patch.aiApiKey) }
    }
    store.setSettings(patch)
    if (patch.downloadPath !== undefined) {
      try { session.defaultSession.setDownloadPath(patch.downloadPath || app.getPath('downloads')) } catch {}
    }
    broadcastSettings()
  })
  ipcMain.handle('search:engines', () => ({ engines: store.engines(), defaultId: store.settings().defaultSearchEngine }))
  ipcMain.handle('search:url', (_e, q) => store.searchUrl(q))
  ipcMain.handle('search:suggest', (_e, q) => searchSuggestions(q))
  ipcMain.handle('ai:chat', (_e, messages) => ai.chat(messages || []))
  ipcMain.handle('adblock:stats', () => adblock.stats())
  ipcMain.handle('adblock:refresh', () => { adblock.refresh(); return true })
  ipcMain.handle('adblock:recent', () => adblock.recentLog())
  ipcMain.handle('shields:get', (_e, origin) => {
    const s = store.settings()
    const shields = (s.siteShields && s.siteShields[origin]) || {}
    const blocked = adblock.stats().blocked[origin] || { ads: 0, scripts: 0 }
    return {
      origin,
      blockAds: shields.blockAds !== undefined ? shields.blockAds : s.blockAds,
      blockScripts: shields.blockScripts !== undefined ? shields.blockScripts : s.blockScripts,
      blockCookies: s.blockThirdPartyCookies,
      ads: blocked.ads || 0,
      scripts: blocked.scripts || 0,
    }
  })
  ipcMain.handle('shields:set', (_e, payload) => {
    const s = store.settings()
    s.siteShields = s.siteShields || {}
    s.siteShields[payload.origin] = Object.assign({}, s.siteShields[payload.origin], payload.patch)
    store.setSettings({ siteShields: s.siteShields })
    return true
  })
  ipcMain.handle('site:cookies', async (_e, origin) => {
    try {
      const list = await session.defaultSession.cookies.get({ url: origin })
      return list.length
    } catch {
      return 0
    }
  })
  ipcMain.handle('site:clear', async (_e, origin) => {
    try {
      const ses = session.defaultSession
      const cookies = await ses.cookies.get({ url: origin })
      for (const c of cookies) {
        try { await ses.cookies.remove(origin, c.name) } catch {}
      }
      await ses.clearStorageData({ origin })
    } catch {}
    return true
  })
  ipcMain.handle('data:clear', async (_e, what) => {
    const ses = session.defaultSession
    if (what.cache) await ses.clearCache()
    if (what.cookies || what.local) await ses.clearStorageData()
    if (what.history) store.clearHistory()
    if (what.downloads) { store.clearDownloads(); broadcastDownloads() }
    return true
  })
}

function autocompleteQuery(q) {
  const input = (q || '').trim()
  if (!input) return []
  const out = []
  const looksUrl = /^[\w-]+(\.[\w-]+)+([/:?#].*)?$/.test(input) || /^localhost(:\d+)?(\/.*)?$/.test(input)
  if (looksUrl) {
    out.push({ type: 'url', title: input, url: /^https?:\/\//.test(input) ? input : 'https://' + input })
  }
  const term = input.toLowerCase()
  store.searchHistory(term, 3).forEach((h) => out.push({ type: 'history', title: h.title || h.url, url: h.url, meta: h.url }))
  store.searchBookmarks(term, 3).forEach((b) => out.push({ type: 'bookmark', title: b.title || b.url, url: b.url, meta: b.url }))
  const engine = store.engineById(store.settings().defaultSearchEngine)
  out.push({ type: 'search', title: 'Buscar en ' + engine.name + ': ' + input, url: store.engineSearchUrl(engine, input) })
  return out.slice(0, 8)
}

const SUGGEST_URLS = {
  google: 'https://suggestqueries.google.com/complete/search?client=firefox&q={q}',
  duckduckgo: 'https://duckduckgo.com/ac/?q={q}&type=list',
  bing: 'https://api.bing.com/osjson.aspx?query={q}',
  brave: 'https://search.brave.com/api/suggest?q={q}',
  yahoo: 'https://search.yahoo.com/sugg/gossip/gossip-us-ura/?output=json&command={q}',
  startpage: 'https://www.startpage.com/sp/custom_search/suggest?q={q}',
  qwant: 'https://api.qwant.com/v3/suggest?q={q}',
  ecosia: 'https://ac.ecosia.org/?q={q}',
  mojeek: 'https://www.mojeek.com/search/q?query={q}&fmt=json',
}

function parseSuggestions(json) {
  let arr = null
  if (Array.isArray(json)) arr = json[1]
  else if (json && Array.isArray(json.results)) arr = json.results
  if (!Array.isArray(arr)) return []
  return arr
    .map((x) => (typeof x === 'string' ? x : x && (x.query || x.suggestion || x.phrase || x.value)))
    .filter((x) => typeof x === 'string' && x.trim())
    .slice(0, 6)
}

async function searchSuggestions(q) {
  const term = (q || '').trim()
  if (!term || term.length < 2) return []
  const engineId = store.settings().defaultSearchEngine
  const tpl = SUGGEST_URLS[engineId] || SUGGEST_URLS.google
  try {
    const res = await net.fetch(tpl.replace('{q}', encodeURIComponent(term)), {
      signal: AbortSignal.timeout(2500),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36' },
    })
    if (!res.ok) return []
    const json = await res.json().catch(() => null)
    return parseSuggestions(json)
  } catch {
    return []
  }
}

app.on('web-contents-created', (_e, wc) => {
  if (wc.getType() === 'window') {
    wc.on('will-attach-webview', (event, webPreferences) => {
      webPreferences.sandbox = true
      webPreferences.contextIsolation = true
      webPreferences.nodeIntegration = false
      webPreferences.nodeIntegrationInSubFrames = false
      webPreferences.webSecurity = true
      webPreferences.allowRunningInsecureContent = false
      webPreferences.spellcheck = false
    })
    return
  }
  if (wc.getType() !== 'webview') return
  registerTab(wc)
  wc.on('context-menu', (_ev, params) => {
    const ctx = ctxForWc(wc)
    if (ctx) showContentMenu(ctx, wc, params)
  })
  wc.on('did-start-navigation', (_e, url, _isInPlace, isMainFrame) => {
    if (isMainFrame && url && /^https?:/.test(url) && store.settings().safeBrowsing !== false) checkUrl(url, wc)
  })
  wc.on('will-navigate', (e, url) => {
    let proto = ''
    try { proto = new URL(url).protocol } catch { e.preventDefault(); return }
    const ALLOWED = ['http:', 'https:', 'nixer:', 'chrome-extension:', 'about:', 'data:']
    if (!ALLOWED.includes(proto)) {
      e.preventDefault()
      return
    }
    if (store.settings().safeBrowsing === false) return
    const host = sbHost(url)
    const cached = host && SB_CACHE.get(host)
    if (cached && cached.bad) {
      e.preventDefault()
      try { wc.loadURL('nixer://warning?url=' + encodeURIComponent(url)) } catch {}
    }
  })
  wc.setWindowOpenHandler(({ url }) => {
    const c = ctxForWc(wc)
    if (c && url) sendUi(c, 'open-tab', url)
    return { action: 'deny' }
  })
  wc.on('dom-ready', () => {
    let host = ''
    try { host = new URL(wc.getURL()).hostname } catch {}
    if (host !== 'chromewebstore.google.com') return
    try {
      wc.executeJavaScript(`(() => {
        try {
          const brands = [{ brand: 'Chromium', version: '136' }, { brand: 'Google Chrome', version: '136' }, { brand: 'Not=A?Brand', version: '99' }]
          const fake = {
            brands,
            mobile: false,
            platform: 'Windows',
            getHighEntropyValues: () => Promise.resolve({ brands, mobile: false, platform: 'Windows', architecture: 'x86', bitness: '64', platformVersion: '10.0.0', uaFullVersion: '136.0.0.0' }),
          }
          Object.defineProperty(Navigator.prototype, 'userAgentData', { configurable: true, get: () => fake })
          if (!window.chrome) window.chrome = {}
          if (!window.chrome.webstore) window.chrome.webstore = {}
          if (!window.chrome.management) {
            window.chrome.management = { getSelf: (cb) => cb && cb({ id: '', name: 'Nixer Browser', enabled: true, type: 'normal', installType: 'normal' }) }
          }
        } catch (e) {}
        return true
      })()`)
    } catch {}
  })
})

app.whenReady().then(() => {
  const ua = session.defaultSession
    .getUserAgent()
    .replace(/navegador\/[\d.]+/i, '')
    .replace(/NixerBrowser\/[\d.]+/i, '')
    .replace(/Electron\/[\d.]+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  const CHROME_HINTS = {
    'sec-ch-ua': '"Chromium";v="136", "Google Chrome";v="136", "Not=A?Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'user-agent': ua,
  }
  session.defaultSession.setUserAgent(ua)
  session.fromPartition(PRIVATE_PARTITION).setUserAgent(ua)
  for (const ses of [session.defaultSession, session.fromPartition(PRIVATE_PARTITION)]) {
    ses.webRequest.onBeforeSendHeaders({ urls: ['*://chromewebstore.google.com/*'] }, (details, cb) => {
      cb({ requestHeaders: Object.assign({}, details.requestHeaders, CHROME_HINTS) })
    })
  }
  const dl = store.settings().downloadPath
  if (dl) {
    try { session.defaultSession.setDownloadPath(dl) } catch {}
  }
  initDownloads()
  adblock.init(session.defaultSession, guardState)
  adblock.init(session.fromPartition(PRIVATE_PARTITION), guardState)
  initPermissions(session.defaultSession)
  initPermissions(session.fromPartition(PRIVATE_PARTITION))
  adblock.refresh()
  buildMenu()
  registerIpc()
  setupExtensions()
  nixer.install([session.defaultSession, session.fromPartition(PRIVATE_PARTITION)])
  rehydrateExtensions()
  createWindow()
  if (process.env.SMOKE === '1') runSmoke()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  setInterval(gcHiddenWebviews, 45000)
  const startUrl = process.argv.find((a) => /^https?:\/\//i.test(a))
  if (startUrl) {
    setTimeout(() => {
      const c = currentCtx()
      if (c) sendUi(c, 'open-tab', startUrl)
    }, 1500)
  }
})

async function runSmoke() {
  const http = require('http')
  const results = {}
  try {
    const ctx = windows.values().next().value
    const uiWc = ctx.win.webContents
    await new Promise((r) => setTimeout(r, 3000))

    const errors = []
    session.defaultSession.webRequest.onErrorOccurred({ urls: ['*://*/*'] }, (d) => errors.push(d))

    const server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'text/html')
      res.end('<html><body><h1>test</h1><img src="https://doubleclick.net/x.png"><img src="https://example.com/y.png"></body></html>')
    })
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    const port = server.address().port

    results.webviews = await uiWc.executeJavaScript(`document.querySelectorAll('webview').length`)

    results.autocomplete = await uiWc.executeJavaScript(`
      (async () => {
        const input = document.querySelector('.address-bar input')
        if (!input) return 'NO_INPUT'
        input.focus()
        input.dispatchEvent(new Event('focusin', { bubbles: true }))
        const setVal = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setVal.call(input, 'yout')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 700))
        const dd = document.querySelector('.autocomplete')
        return { dropdown: !!dd, count: dd ? dd.querySelectorAll('.suggestion').length : 0 }
      })()
    `)

    results.menu = await uiWc.executeJavaScript(`
      (async () => {
        document.querySelector('.menu-btn').click()
        await new Promise((r) => setTimeout(r, 400))
        const dd = !!document.querySelector('.dropdown')
        const webviewStillVisible = !!document.querySelector('webview.active')
        return { dropdown: dd, webviewStillVisible }
      })()
    `)

    await uiWc.executeJavaScript(`(async () => { document.querySelector('.menu-btn').click(); await new Promise((r) => setTimeout(r, 400)); return true })()`)

    await uiWc.executeJavaScript(`
      (async () => {
        const wv = document.querySelector('webview.active')
        if (!wv) return 'NO_WEBVIEW'
        wv.loadURL('http://127.0.0.1:${port}/')
        await new Promise((r) => setTimeout(r, 3500))
        return true
      })()
    `)
    const blocked = errors.filter((e) => e.url.includes('doubleclick.net') && String(e.error).toUpperCase().includes('BLOCKED_BY_CLIENT'))
    results.adblock = blocked.length > 0
    results.doubleclickErrors = errors.filter((e) => e.url.includes('doubleclick.net')).map((e) => e.error)
    results.anyAdErrors = errors.map((e) => e.error)
    results.webviewAfterNav = await uiWc.executeJavaScript(`document.querySelector('webview.active') ? 'YES' : 'NO'`)
    results.pageUrl = await uiWc.executeJavaScript(`(() => { const wv = document.querySelector('webview.active'); return wv ? wv.getURL() : '' })()`)
    results.webviewRect = await uiWc.executeJavaScript(`(() => { const wv = document.querySelector('webview.active'); if (!wv) return null; const r = wv.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) } })()`)
    results.preloadOk = await uiWc.executeJavaScript(`
      (async () => {
        const wv = document.querySelector('webview.active')
        try { return await wv.executeJavaScript('typeof window.browserAPI') } catch (e) { return 'ERR:' + e.message }
      })()
    `)
    server.close()
  } catch (e) {
    results.error = String(e)
  }
  console.log('SMOKE_RESULT:', JSON.stringify(results))
  const ok = results.webviews > 0
    && results.autocomplete && results.autocomplete.dropdown
    && results.menu && results.menu.dropdown && results.menu.webviewStillVisible
    && results.adblock === true
    && results.webviewAfterNav === 'YES'
  app.exit(ok ? 0 : 1)
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
