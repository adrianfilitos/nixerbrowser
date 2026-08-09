const { app, safeStorage } = require('electron')
const fs = require('fs')
const path = require('path')

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
  sendDnt: true,
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
  askDownloadLocation: true,
  showDownloadNotifications: true,
  openFolderWhenDone: false,
  offerPasswordSave: true,
  autofillEnabled: true,
  blockPopups: true,
  autoplayPolicy: 'user-gesture-required',
  hardwareAcceleration: true,
  gpuRasterization: true,
  pageFontSize: 16,
  aiProvider: 'openai',
  aiTemperature: 0.7,
  aiMaxTokens: 1000,
  downloadPath: '',
  autofillProfile: { name: '', email: '', phone: '', company: '', address: '', city: '', zip: '' },
}

const DEFAULTS = {
  bookmarks: [],
  history: [],
  closedTabs: [],
  downloads: [],
  session: [],
  passwords: [],
  extensions: [],
}

let state = loadAll()

function file(name) {
  return path.join(app.getPath('userData'), name)
}

function load(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file(name), 'utf8'))
  } catch {
    return JSON.parse(JSON.stringify(fallback))
  }
}

function loadAll() {
  const s = {}
  for (const k of Object.keys(DEFAULTS)) s[k] = load(k, DEFAULTS[k])
  s.settings = Object.assign({}, DEFAULT_SETTINGS, load('settings', {}))
  return s
}

function persist(name) {
  try {
    fs.writeFileSync(file(name), JSON.stringify(state[name], null, 2))
  } catch {}
}

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

function toggleBookmark(url, title) {
  const existing = state.bookmarks.find((b) => b.url === url)
  if (existing) {
    removeBookmark(existing.id)
    return false
  }
  addBookmark({ url, title })
  return true
}

function closedTabs() {
  return state.closedTabs
}

function pushClosed(tab) {
  state.closedTabs.unshift({ url: tab.url, title: tab.title, ts: Date.now() })
  if (state.closedTabs.length > 50) state.closedTabs.length = 50
  persist('closedTabs')
}

function popClosed() {
  const t = state.closedTabs.shift()
  persist('closedTabs')
  return t || null
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
    .map((t) => ({ url: t.url, pinned: !!t.pinned }))
    .filter((t) => t.url && t.url.startsWith('http') && !isLoopbackUrl(t.url))
    .slice(0, 30)
  persist('session')
}

function isLoopbackUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host === 'localhost' || host === '[::1]' || host === '::1' || host.startsWith('127.')
  } catch {
    return false
  }
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
  isBookmarked,
  toggleBookmark,
  closedTabs,
  pushClosed,
  popClosed,
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
  listPasswords,
  addPassword,
  removePassword,
  hasPassword,
  getPassword,
  encryptSecret,
  decryptSecret,
  listExtensions,
  addExtension,
  removeExtension,
  setExtensionEnabled,
  contentScriptsFor,
}
