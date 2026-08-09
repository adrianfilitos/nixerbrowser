const { app, BrowserWindow, session } = require('electron')
const path = require('path')
const fs = require('fs')
const AdmZip = require('adm-zip')
const { net } = require('electron')
const { ElectronChromeExtensions } = require('electron-chrome-extensions')
const store = require('./store')
const { currentCtx, sendUi } = require('./ctx')

let extEngine = null
const pendingExtCreate = []

function setupExtensions(createWindow) {
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
      const c = win ? require('./ctx').windows.get(win) : null
      if (c) sendUi(c, 'activate-tab', tab.id)
    },
    removeTab: (tab) => {
      if (!tab || tab.isDestroyed()) return
      let win = null
      try { win = BrowserWindow.fromWebContents(tab) } catch {}
      const c = win ? require('./ctx').windows.get(win) : null
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
  const cver = String(process.versions.chrome).split('.')[0] + '.0.0.0'
  const url = 'https://clients2.google.com/service/update2/crx?response=redirect&prodversion=' + cver + '&acceptformat=crx2,crx3&x=id%3D' + extId + '%26installsource%3Dondemand%26uc'
  try {
    const res = await net.fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + cver + ' Safari/537.36' } })
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

function getEngine() {
  return extEngine
}

module.exports = {
  setupExtensions,
  registerTab,
  loadExtensionFolder,
  rehydrateExtensions,
  crxZipOffset,
  installExtensionFromStore,
  extStorageGet,
  extStorageSet,
  getEngine,
}
