const { app, safeStorage } = require('electron')
const fs = require('fs')
const path = require('path')
const dbmod = require('./db')

const BUILTIN_ENGINES = [
  { id: 'google', name: 'Google', tpl: 'https://www.google.com/search?q={q}' },
  { id: 'brave', name: 'Brave', tpl: 'https://search.brave.com/search?q={q}' },
  { id: 'duckduckgo', name: 'DuckDuckGo', tpl: 'https://duckduckgo.com/?q={q}' },
  { id: 'bing', name: 'Bing', tpl: 'https://www.bing.com/search?q={q}' },
  { id: 'yahoo', name: 'Yahoo', tpl: 'https://search.yahoo.com/search?p={q}' },
  { id: 'ecosia', name: 'Ecosia', tpl: 'https://www.ecosia.org/search?q={q}' },
  { id: 'startpage', name: 'Startpage', tpl: 'https://www.startpage.com/sp/search?query={q}' },
  { id: 'qwant', name: 'Qwant', tpl: 'https://www.qwant.com/?q={q}' },
  { id: 'mojeek', name: 'Mojeek', tpl: 'https://www.mojeek.com/search?q={q}' },
]

const DEFAULT_SETTINGS = {
  defaultSearchEngine: 'google',
  homePage: 'https://www.google.com',
  startupBehavior: 'newTab',
  theme: 'dark',
  showBookmarksBar: true,
  blockAds: true,
  blockThirdPartyCookies: true,
  blockScripts: false,
  httpsUpgrade: false,
  sendDnt: false,
  customSearchEngines: [],
  aiBaseUrl: '',
  aiApiKey: '',
  aiModel: 'gpt-4o-mini',
  sitePermissions: {},
  siteShields: {},
  profileCreated: false,
  profileName: '',
  profileColor: '#6c7bff',
  accentColor: '#6c7bff',
  newtabWallpaper: 'none',
  shortcuts: [],
  showClock: true,
  showSearch: true,
  showRecent: true,
  greeting: '',
  compact: false,
  memorySaver: true,
  doh: true,
  safeBrowsing: true,
  defaultZoom: 1,
  uiBackground: '',
  tabShape: 'rounded',
  tabStripPosition: 'top',
  animations: true,
  reduceMotion: false,
  highContrast: false,
  uiFontScale: 100,
  toolbarFontSize: 13,
  tabMinWidth: 120,
  showHomeButton: true,
  showDownloadsButton: true,
  showExtensionsButton: true,
  showIncognitoBadge: true,
  showMenuButton: true,
  lastTabCloseAction: 'newTab',
  openLinksInBackground: false,
  confirmCloseMultiple: true,
  clearDataOnExit: false,
  launchAtStartup: false,
  minimizeToTray: false,
  startMinimized: false,
  tvMode: false,
  tvAutoFullscreen: true,
  askDownloadLocation: true,
  showDownloadNotifications: true,
  openFolderWhenDone: false,
  offerPasswordSave: true,
  autofillEnabled: true,
  searchSuggestionsEnabled: true,
  showImages: true,
  forcePageTheme: '',
  blockPopups: true,
  autoplayPolicy: 'user-gesture-required',
  hardwareAcceleration: true,
  gpuRasterization: true,
  pageFontSize: 16,
  aiProvider: 'openai',
  aiTemperature: 0.7,
  aiMaxTokens: 1000,
  language: 'es',
  downloadPath: '',
  autofillProfile: { name: '', email: '', phone: '', company: '', address: '', city: '', zip: '' },
}

const DEFAULTS = {
  bookmarks: [],
  history: [],
  downloads: [],
  session: [],
  passwords: [],
  extensions: [],
  recentSearches: [],
  readingList: [],
  tabGroups: {},
  workspaces: [],
}

let state

function file(name) {
  return path.join(app.getPath('userData'), name)
}

// ---- Cifrado en reposo ----------------------------------------------------
// safeStorage cifra con la clave del SO (Keychain/DPAPI) y solo está disponible
// después de app.ready. Por eso los valores sensibles viven CIFRADOS en memoria
// (patrón ya usado por passwords/aiApiKey) y se descifran de forma perezosa en
// el punto de acceso; al escribir a disco se mantienen cifrados.

const ENC_SETTINGS = ['aiApiKey', 'autofillProfile']

function encJson(v) {
  return encryptSecret(JSON.stringify(v))
}

function decodeSettingValue(value) {
  if (value === undefined || value === null) return undefined
  const t = typeof value
  if (t !== 'string') return value
  if (value === 'true') return true
  if (value === 'false') return false
  if (value !== '' && /^-?\d+(\.\d+)?$/.test(value)) return Number(value)
  try { return JSON.parse(value) } catch { return value }
}

function encodeSetting(name, value) {
  if (name === 'aiApiKey') {
    if (typeof value === 'string' && value.startsWith('e1:')) return value
    return encryptSecret(String(value || ''))
  }
  if (name === 'autofillProfile') {
    if (value && typeof value === 'string' && value.startsWith('e1:')) return value
    return encJson(value || {})
  }
  if (value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function decryptProfile(v) {
  if (v && typeof v === 'string' && v.startsWith('e1:')) {
    try {
      const d = JSON.parse(decryptSecret(v))
      return d && typeof d === 'object' ? d : {}
    } catch {
      return {}
    }
  }
  return (v && typeof v === 'object') ? v : {}
}

// ---- Persistencia SQLite --------------------------------------------------

const COLLECTIONS = {
  settings: {
    table: 'settings',
    columns: ['name', 'value'],
    to: (s) => Object.entries(s).map(([k, v]) => [k, encodeSetting(k, v)]),
    from: (rows) => {
      const out = {}
      for (const r of rows) {
        // Los valores cifrados se conservan tal cual en memoria; el descifrado es perezoso.
        const v = ENC_SETTINGS.includes(r.name) ? r.value : decodeSettingValue(r.value)
        if (v !== undefined) out[r.name] = v
      }
      return out
    },
  },
  history: {
    table: 'history',
    columns: ['id', 'url', 'title', 'ts'],
    to: (arr) => arr.map((h) => [null, h.url || '', h.title || '', h.ts || 0]),
    from: (rows) => rows.slice().reverse().map((r) => ({ url: r.url, title: r.title })),
  },
  bookmarks: {
    table: 'bookmarks',
    columns: ['id', 'url', 'title', 'folder', 'ts'],
    to: (arr) => arr.map((b) => [b.id, b.url, b.title || b.url, b.folder || '', b.ts || 0]),
    from: (rows) => rows.slice().reverse().map((r) => ({ id: r.id, url: r.url, title: r.title, folder: r.folder, ts: r.ts })),
  },
  downloads: {
    table: 'downloads',
    columns: ['id', 'name', 'url', 'path', 'received', 'total', 'state'],
    to: (arr) => arr.map((d) => [d.id, d.name || '', d.url || '', d.path || '', d.received || 0, d.total || 0, d.state || '']),
    from: (rows) => rows.slice().reverse().map((r) => ({ id: r.id, name: r.name, url: r.url, path: r.path, received: r.received, total: r.total, state: r.state })),
  },
  passwords: {
    table: 'passwords',
    columns: ['id', 'origin', 'username', 'password', 'ts'],
    to: (arr) => arr.map((p) => [p.id, p.origin, p.username || '', p.password, p.ts || 0]),
    from: (rows) => rows.slice().reverse().map((r) => ({ id: r.id, origin: r.origin, username: r.username, password: r.password, ts: r.ts })),
  },
  session: {
    table: 'session',
    columns: ['ord', 'url', 'pinned', 'grp'],
    to: (arr) => arr.map((s, i) => [i, s.url || '', s.pinned ? 1 : 0, s.group || '']),
    from: (rows) => rows.map((r) => ({ url: r.url, pinned: !!r.pinned, group: r.grp || undefined })),
  },
  extensions: {
    table: 'extensions',
    columns: ['id', 'json'],
    to: (arr) => arr.map((e) => [e.id, JSON.stringify(e)]),
    from: (rows) => rows.slice().reverse().map((r) => { try { return JSON.parse(r.json) } catch { return null } }).filter(Boolean),
  },
  recentSearches: {
    table: 'recentsearches',
    columns: ['q', 'ts'],
    to: (arr) => arr.map((q) => [q, 0]),
    from: (rows) => rows.slice().reverse().map((r) => r.q),
  },
  readingList: {
    table: 'readinglist',
    columns: ['id', 'title', 'url', 'text', 'ts'],
    to: (arr) => arr.map((r) => [r.id, r.title || '', r.url || '', r.text && typeof r.text === 'string' && !r.text.startsWith('e1:') ? encJson(r.text) : (r.text || ''), r.ts || 0]),
    from: (rows) => rows.slice().reverse().map((r) => ({ id: r.id, title: r.title, url: r.url, text: r.text, ts: r.ts })),
  },
  tabGroups: {
    table: 'tabgroups',
    columns: ['name', 'json'],
    to: (obj) => Object.entries(obj || {}).map(([n, g]) => [n, JSON.stringify(g)]),
    from: (rows) => {
      const out = {}
      for (const r of rows) { try { out[r.name] = JSON.parse(r.json) } catch {} }
      return out
    },
  },
  workspaces: {
    table: 'workspaces',
    columns: ['name', 'json'],
    to: (arr) => arr.map((w) => [w.name, JSON.stringify({ tabs: w.tabs, ts: w.ts })]),
    from: (rows) => rows.slice().reverse().map((r) => { try { const d = JSON.parse(r.json); return { name: r.name, tabs: d.tabs || [], ts: d.ts || 0 } } catch { return { name: r.name, tabs: [], ts: 0 } } }),
  },
}

function loadAll() {
  const { created } = dbmod.open(app.getPath('userData'))
  const s = {}
  for (const k of Object.keys(DEFAULTS)) s[k] = loadCollection(k)
  s.settings = Object.assign({}, DEFAULT_SETTINGS, loadCollection('settings'))
  if (created) migrateLegacy(s)
  return s
}

function loadCollection(name) {
  const cols = COLLECTIONS[name]
  if (!cols) return JSON.parse(JSON.stringify(DEFAULTS[name]))
  try {
    const rows = dbmod.selectAll(cols.table, cols.columns)
    return cols.from(rows)
  } catch {
    return JSON.parse(JSON.stringify(DEFAULTS[name]))
  }
}

function persist(name) {
  try {
    const cols = COLLECTIONS[name]
    if (!cols) return
    const rows = cols.to(state[name])
    dbmod.clearInsert(cols.table, cols.columns, rows)
  } catch {}
}

function migrateLegacy(s) {
  let migrated = false
  const legacyFiles = ['settings', 'history', 'bookmarks', 'downloads', 'passwords', 'session', 'extensions', 'recentSearches', 'readingList', 'tabGroups', 'workspaces']
  for (const k of legacyFiles) {
    let v
    try {
      v = JSON.parse(fs.readFileSync(file(k + '.json'), 'utf8'))
    } catch {
      continue
    }
    if (k === 'settings') s.settings = Object.assign({}, DEFAULT_SETTINGS, v)
    else s[k] = v
    migrated = true
  }
  if (migrated) {
    for (const k of legacyFiles) persist(k)
  }
}

state = loadAll()

function addHistory(entry) {
  state.history.unshift(entry)
  if (state.history.length > 5000) state.history.length = 5000
  persist('history')
}

function updateHistoryTitle(url, title) {
  if (!url || !title) return
  const h = state.history.find((x) => x.url === url)
  if (h && (!h.title || h.title === h.url)) {
    h.title = title
    persist('history')
  }
}

function searchHistory(q, limit) {
  const term = (q || '').toLowerCase()
  return state.history.filter((h) => !term || h.title.toLowerCase().includes(term) || h.url.toLowerCase().includes(term)).slice(0, limit || 50)
}

function listHistory() {
  return state.history
}

function clearHistory() {
  state.history = []
  persist('history')
}

function removeHistory(url) {
  state.history = state.history.filter((h) => h.url !== url)
  persist('history')
}

function listBookmarks() {
  return state.bookmarks
}

function searchBookmarks(q, limit) {
  const term = (q || '').toLowerCase()
  return state.bookmarks.filter((b) => !term || b.title.toLowerCase().includes(term) || b.url.toLowerCase().includes(term)).slice(0, limit || 50)
}

function addBookmark(b) {
  const rec = { id: Date.now() + '-' + Math.floor(Math.random() * 1e4), url: b.url, title: b.title || b.url, folder: b.folder || '', ts: Date.now() }
  state.bookmarks.unshift(rec)
  persist('bookmarks')
  return rec
}

function removeBookmark(id) {
  state.bookmarks = state.bookmarks.filter((b) => b.id !== id)
  persist('bookmarks')
}

function reorderBookmarks(ids) {
  const map = new Map(state.bookmarks.map((b) => [b.id, b]))
  state.bookmarks = (ids || []).map((id) => map.get(id)).filter(Boolean)
  persist('bookmarks')
}

function updateBookmark(id, patch) {
  const b = state.bookmarks.find((x) => x.id === id)
  if (b) {
    if ('title' in patch) b.title = patch.title
    if ('url' in patch) b.url = patch.url
    if ('folder' in patch) b.folder = patch.folder
    persist('bookmarks')
  }
}

function isBookmarked(url) {
  return state.bookmarks.some((b) => b.url === url)
}

function settings() {
  return state.settings
}

function setSettings(patch) {
  Object.assign(state.settings, patch)
  persist('settings')
}

function engines() {
  return [...BUILTIN_ENGINES, ...(state.settings.customSearchEngines || [])]
}

function engineById(id) {
  return engines().find((e) => e.id === id) || BUILTIN_ENGINES[0]
}

function searchUrl(q) {
  return engineById(state.settings.defaultSearchEngine).tpl.replace('{q}', encodeURIComponent(q))
}

function engineSearchUrl(engine, q) {
  return engine.tpl.replace('{q}', encodeURIComponent(q))
}

function downloads() {
  return state.downloads
}

function upsertDownload(d) {
  const i = state.downloads.findIndex((x) => x.id === d.id)
  if (i >= 0) state.downloads[i] = d
  else state.downloads.unshift(d)
  persist('downloads')
}

function clearDownloads() {
  state.downloads = state.downloads.filter((d) => d.state === 'in-progress')
  persist('downloads')
}

function session() {
  return state.session
}

function encryptSecret(t) {
  if (!t) return t
  try {
    if (safeStorage.isEncryptionAvailable()) return 'e1:' + safeStorage.encryptString(String(t)).toString('base64')
  } catch {}
  return t
}

function decryptSecret(t) {
  if (typeof t === 'string' && t.startsWith('e1:')) {
    try {
      return safeStorage.decryptString(Buffer.from(t.slice(3), 'base64'))
    } catch {
      return ''
    }
  }
  return t
}

function listPasswords() {
  return state.passwords.map((p) => ({ ...p, password: decryptSecret(p.password) }))
}

function addPassword(p) {
  const rec = { id: Date.now() + '-' + Math.floor(Math.random() * 1e4), origin: p.origin, username: p.username || '', password: encryptSecret(p.password || ''), ts: Date.now() }
  state.passwords.unshift(rec)
  persist('passwords')
  return rec
}

function removePassword(id) {
  state.passwords = state.passwords.filter((p) => p.id !== id)
  persist('passwords')
}

function hasPassword(origin) {
  return state.passwords.some((p) => p.origin === origin)
}

function getPassword(origin) {
  const p = state.passwords.find((x) => x.origin === origin)
  return p ? { username: p.username, password: decryptSecret(p.password) } : null
}

function listExtensions() {
  return state.extensions
}

function addExtension(ext) {
  state.extensions.unshift(Object.assign({ enabled: true, ts: Date.now() }, ext))
  persist('extensions')
}

function removeExtension(id) {
  state.extensions = state.extensions.filter((e) => e.id !== id)
  persist('extensions')
}

function setExtensionEnabled(id, enabled) {
  const e = state.extensions.find((x) => x.id === id)
  if (e) {
    e.enabled = !!enabled
    persist('extensions')
  }
}

function contentScriptsFor(url) {
  const scripts = []
  for (const e of state.extensions) {
    if (!e.enabled || !e.contentScripts) continue
    for (const cs of e.contentScripts) {
      if (cs.matches && cs.matches.some((m) => globMatch(m, url)) && cs.js) {
        for (const code of cs.js) scripts.push(code)
      }
    }
  }
  return scripts
}

function globMatch(pattern, url) {
  const re = new RegExp('^' + pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$')
  return re.test(url)
}
function saveSession(tabs) {
  state.session = tabs
    .map((t) => ({ url: t.url, pinned: !!t.pinned, group: t.group || undefined }))
    .filter((t) => t.url && t.url.startsWith('http') && !isLoopbackUrl(t.url))
    .slice(0, 30)
  persist('session')
}

function tabGroups() {
  return state.tabGroups || {}
}

function setTabGroups(groups) {
  state.tabGroups = groups || {}
  persist('tabGroups')
}

function listWorkspaces() {
  return state.workspaces || []
}

function saveWorkspace(name, tabs) {
  const rec = { name: String(name || '').slice(0, 40), tabs: tabs.slice(0, 30), ts: Date.now() }
  state.workspaces = [rec, ...(state.workspaces || []).filter((w) => w.name !== rec.name)].slice(0, 20)
  persist('workspaces')
  return rec
}

function removeWorkspace(name) {
  state.workspaces = (state.workspaces || []).filter((w) => w.name !== name)
  persist('workspaces')
}

function isLoopbackUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host === 'localhost' || host === '[::1]' || host === '::1' || host.startsWith('127.')
  } catch {
    return false
  }
}

function addSearch(q) {
  const s = String(q || '').trim().slice(0, 200)
  if (!s) return
  state.recentSearches = [s, ...state.recentSearches.filter((x) => x !== s)].slice(0, 30)
  persist('recentSearches')
}

function recentSearches(limit) {
  return (state.recentSearches || []).slice(0, limit || 8)
}

function listReadingList() {
  return state.readingList.map((r) => {
    let text = r.text || ''
    if (typeof text === 'string' && text.startsWith('e1:')) {
      try { text = JSON.parse(decryptSecret(text)) } catch {}
    }
    return { ...r, text }
  })
}

function addReadingItem(item) {
  const rec = { id: Date.now() + '-' + Math.floor(Math.random() * 1e4), title: item.title || item.url || '', url: item.url || '', text: item.text || '', ts: Date.now() }
  state.readingList.unshift(rec)
  persist('readingList')
  return rec
}

function removeReadingItem(id) {
  state.readingList = state.readingList.filter((i) => i.id !== id)
  persist('readingList')
}

module.exports = {
  addHistory,
  updateHistoryTitle,
  searchHistory,
  listHistory,
  clearHistory,
  removeHistory,
  listBookmarks,
  searchBookmarks,
  addBookmark,
  removeBookmark,
  updateBookmark,
  reorderBookmarks,
  isBookmarked,
  settings,
  settingsDefaults: () => JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
  setSettings,
  engines,
  engineById,
  searchUrl,
  engineSearchUrl,
  downloads,
  upsertDownload,
  clearDownloads,
  session,
  saveSession,
  isLoopbackUrl,
  addSearch,
  recentSearches,
  listReadingList,
  addReadingItem,
  removeReadingItem,
  tabGroups,
  setTabGroups,
  listWorkspaces,
  saveWorkspace,
  removeWorkspace,
  listPasswords,
  addPassword,
  removePassword,
  hasPassword,
  getPassword,
  encryptSecret,
  decryptSecret,
  decryptProfile,
  listExtensions,
  addExtension,
  removeExtension,
  setExtensionEnabled,
  contentScriptsFor,
}
