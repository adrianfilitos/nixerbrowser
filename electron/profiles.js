const { app, BrowserWindow } = require('electron')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const store = require('./store')
const dbmod = require('./db')
const cloudCfg = require('./cloud-config')

const INDEX_FILE = () => path.join(app.getPath('userData'), 'profiles-index.json')
const PROFILES_DIR = () => path.join(app.getPath('userData'), 'profiles')
const providerList = ['google']

let index = { activeId: null, profiles: [] }
let syncTimer = null

const SYNC_KEYS = ['bookmarks', 'history', 'readingList', 'workspaces', 'tabGroups', 'recentSearches', 'sitePermissions', 'siteShields', 'settings']
const LIST_KEYS = ['bookmarks', 'history', 'readingList', 'workspaces']
const LOCAL_GET = {
  bookmarks: () => store.listBookmarks(),
  history: () => store.listHistory(),
  readingList: () => store.listReadingList(),
  workspaces: () => store.listWorkspaces(),
}

// ---- Índice de perfiles (global) ------------------------------------------

function loadIndex() {
  try { index = Object.assign({ activeId: null, profiles: [] }, JSON.parse(fs.readFileSync(INDEX_FILE(), 'utf8'))) } catch { index = { activeId: null, profiles: [] } }
}
function saveIndex() {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true })
    fs.writeFileSync(INDEX_FILE(), JSON.stringify(index))
  } catch {}
}

function newId(kind) {
  return kind + '-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36)
}

function profileDir(id) {
  return path.join(PROFILES_DIR(), id)
}

function getProfile(id) {
  return index.profiles.find((p) => p.id === id) || null
}

function current() {
  return index.activeId ? getProfile(index.activeId) : null
}

function activeDir() {
  return index.activeId ? profileDir(index.activeId) : app.getPath('userData')
}

// ---- Cambio / activación de perfil ------------------------------------------

function activate(id) {
  const rec = getProfile(id)
  if (!rec) throw new Error('Perfil no encontrado')
  index.activeId = id
  rec.lastUsed = Date.now()
  saveIndex()
  store.setDataDir(profileDir(id))
  return current()
}

function switchTo(id) {
  if (id === index.activeId) return current()
  if (!id) throw new Error('Perfil no válido')
  return activate(id)
}

// ---- Perfiles locales -------------------------------------------------------

function createLocal(name, color) {
  const nm = String(name || '').trim()
  if (!nm) throw new Error('Indica un nombre de perfil')
  const id = newId('local')
  const dir = profileDir(id)
  fs.mkdirSync(dir, { recursive: true })
  index.profiles.push({ id, name: nm.slice(0, 24), color: color || '#6c7bff', type: 'local', createdAt: Date.now(), lastUsed: Date.now() })
  index.activeId = id
  saveIndex()
  store.setDataDir(dir)
  // El perfil ya está creado: que la App abra el inicio y no la pestaña welcome.
  store.setSettings({ profileCreated: true, profileName: nm.slice(0, 24), profileColor: color || '#6c7bff' })
  return current()
}

function ensureDefault() {
  if (!index.profiles.length) createLocal('Por defecto', '#6c7bff')
  return current()
}

function updateProfile(id, patch) {
  const rec = getProfile(id)
  if (!rec) throw new Error('Perfil no encontrado')
  if (patch.name !== undefined) rec.name = String(patch.name).slice(0, 24)
  if (patch.color !== undefined) rec.color = patch.color
  if (patch.avatar !== undefined) rec.avatar = patch.avatar
  if (patch.avatarSource !== undefined) rec.avatarSource = patch.avatarSource === 'provider' ? 'provider' : 'local'
  saveIndex()
  return current()
}

function removeProfile(id) {
  const rec = getProfile(id)
  if (!rec) throw new Error('Perfil no encontrado')
  if (index.profiles.length <= 1) throw new Error('No puedes eliminar el único perfil')
  index.profiles = index.profiles.filter((p) => p.id !== id)
  if (index.activeId === id) index.activeId = null
  saveIndex()
  fs.rmSync(profileDir(id), { recursive: true, force: true })
  return true
}

// ---- Nube (Supabase) --------------------------------------------------------

function cloud() {
  return { url: cloudCfg.url, key: cloudCfg.anonKey }
}

async function supabase(reqPath, opts) {
  const c = cloud()
  if (!c.url || !c.key) throw new Error('La nube no está configurada (cloud-config.json)')
  const headers = { apikey: c.key, 'Content-Type': 'application/json' }
  if (opts && opts.auth) headers.Authorization = 'Bearer ' + opts.auth
  const res = await fetch(c.url + reqPath, {
    method: (opts && opts.method) || 'GET',
    headers,
    body: opts && opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(20000),
  })
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch {}
  if (!res.ok) throw new Error('Nube ' + res.status + ': ' + ((data && (data.message || data.msg)) || text.slice(0, 200)))
  return data
}

function jwtUid(token) {
  try {
    const p = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64').toString('utf8'))
    return p.sub || ''
  } catch {
    return ''
  }
}

function attachCloud(session, email) {
  const uid = session.user && session.user.id ? session.user.id : jwtUid(session.access_token)
  const meta = (session.user && session.user.user_metadata) || {}
  const avatarUrl = meta.avatar_url || meta.picture || meta.avatar || meta.avatarUrl || ''
  const existing = index.profiles.find((p) => p.type === 'cloud' && p.email === String(email).toLowerCase())
  let id = existing ? existing.id : newId('cloud')
  const rec = existing || { id, type: 'cloud', email: String(email).toLowerCase(), name: email.split('@')[0], color: '#1fb6c9', createdAt: Date.now() }
  rec.session = { access_token: session.access_token, refresh_token: session.refresh_token || '' }
  rec.lastSync = null
  // Avatar del proveedor por defecto; toggle a avatar local en la UI.
  if (avatarUrl) {
    rec.avatar = avatarUrl
    rec.avatarSource = 'provider'
  } else if (!rec.avatarSource) {
    rec.avatarSource = 'local'
  }
  if (!existing) index.profiles.push(rec)
  index.activeId = id
  saveIndex()
  const dir = profileDir(id)
  fs.mkdirSync(dir, { recursive: true })
  store.setDataDir(dir)
  // Perfil creado: la App abre el inicio, no la pestaña welcome.
  store.setSettings({ profileCreated: true, profileName: rec.name, profileColor: rec.color })
  return current()
}

async function signupCloud(email, password, adopt) {
  const sourceSnap = adopt ? snapshot() : null
  const res = await supabase('/auth/v1/signup', { method: 'POST', body: { email, password } })
  const session = { access_token: res.access_token || '', refresh_token: res.refresh_token || '', user: res.user || { id: res.id, email } }
  if (!session.access_token) return signinCloud(email, password, adopt)
  attachCloud(session, email)
  try { await pullAndMerge() } catch {}
  if (sourceSnap) {
    mergeRemote(sourceSnap)
    try { await syncNow() } catch {}
  }
  return current()
}

async function signinCloud(email, password, adopt) {
  const sourceSnap = adopt ? snapshot() : null
  const session = await supabase('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } })
  attachCloud(session, email)
  try { await pullAndMerge() } catch {}
  if (sourceSnap) {
    mergeRemote(sourceSnap)
    try { await syncNow() } catch {}
  }
  return current()
}

async function signoutCloud() {
  const rec = current()
  if (rec && rec.type === 'cloud') {
    delete rec.session
    rec.lastSync = null
    saveIndex()
  }
  return true
}

// ---- OAuth (Google, Microsoft, …) -------------------------------------------

// Puerto fijo para el callback local del OAuth: debe estar whitelistado en
// Supabase (Auth -> URL Configuration -> Redirect URLs).
const OAUTH_CALLBACK_PORT = 17321

// PKCE (RFC 7636): necesario para que Supabase devuelva el `code` en la QUERY
// (flujo authorization_code). Sin PKCE usa el flujo implicit (token en el
// fragmento de la URL), que no es el que esperamos.
function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function pkcePair() {
  const verifier = base64url(crypto.randomBytes(48))
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

async function signInWithProvider(provider) {
  const c = cloud()
  if (!c.url || !c.key) throw new Error('La nube no está configurada (cloud-config.json)')
  const redirect = 'http://127.0.0.1:' + OAUTH_CALLBACK_PORT + '/callback'
  const dbg = (msg) => {
    try { fs.appendFileSync(path.join(app.getPath('userData'), 'oauth-debug.log'), new Date().toISOString() + ' ' + msg + '\n') } catch {}
    console.log(msg)
  }
  const { verifier, challenge } = pkcePair()
  const authWin = new BrowserWindow({
    width: 520,
    height: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  })
  return new Promise((resolve, reject) => {
    let done = false
    const finish = (fn, v) => {
      if (done) return
      done = true
      clearTimeout(timeout)
      try { authWin.destroy() } catch {}
      fn(v)
    }
    const timeout = setTimeout(() => finish(reject, new Error('Tiempo de espera del inicio de sesión agotado')), 120000)
    const handleUrl = async (url, ev) => {
      dbg('OAUTH_URL: ' + (url && url.slice(0, 220)))
      if (!url || !url.startsWith(redirect)) return
      if (ev) ev.preventDefault()
      try {
        const u = new URL(url)
        const err = u.searchParams.get('error_description') || u.searchParams.get('error')
        if (err) return finish(reject, new Error('Error del proveedor: ' + err))
        let code = u.searchParams.get('code')
        // Defensivo: si algún proveedor devuelve el token en el fragmento.
        if (!code && u.hash) {
          try {
            const h = new URLSearchParams(u.hash.replace(/^#/, ''))
            code = h.get('code') || h.get('access_token') || ''
          } catch {}
        }
        if (!code) return finish(reject, new Error('El proveedor no devolvió código'))
        dbg('OAUTH_CODE_FOUND: ' + !!code)
        const session = await supabase('/auth/v1/token?grant_type=pkce', {
          method: 'POST',
          body: { auth_code: code, redirect_to: redirect, code_verifier: verifier },
        })
        dbg('OAUTH_EXCHANGE_OK')
        finish(resolve, session)
      } catch (e) {
        dbg('OAUTH_ERR: ' + (e && e.message))
        finish(reject, e)
      }
    }
    const wc = authWin.webContents
    wc.on('will-redirect', (e, url) => { handleUrl(url, e) })
    wc.on('will-navigate', (e, url) => { handleUrl(url, e) })
    wc.on('did-redirect-navigation', (_e, url) => { handleUrl(url) })
    wc.on('did-fail-load', (_e, code, desc, url) => { if (url && url.startsWith(redirect)) handleUrl(url) })
    authWin.on('closed', () => { if (!done) finish(reject, new Error('Ventana de inicio de sesión cerrada')) })
    // El redirect al callback local (127.0.0.1) no tiene servidor: el load "falla"
    // pero el código ya se capturó en will-redirect/did-fail-load. No rechazar aquí.
    authWin.loadURL(c.url + '/auth/v1/authorize?provider=' + provider +
      '&redirect_to=' + encodeURIComponent(redirect) +
      '&code_challenge=' + challenge + '&code_challenge_method=S256').catch((e) => { if (!done) dbg('OAUTH_LOAD_ERR: ' + (e && e.message)) })
    authWin.show()
  })
}

async function loginWithProvider(provider, adopt) {
  const sourceSnap = adopt ? snapshot() : null
  const session = await signInWithProvider(provider)
  const email = (session.user && session.user.email) || ''
  if (!email) throw new Error('No se obtuvo el correo del proveedor')
  attachCloud(session, email)
  try { await pullAndMerge() } catch {}
  if (sourceSnap) {
    mergeRemote(sourceSnap)
    try { await syncNow() } catch {}
  }
  return current()
}

// ---- Sincronización ---------------------------------------------------------

function pickSettings(s) {
  const safe = {}
  const keys = ['theme', 'accentColor', 'showBookmarksBar', 'homePage', 'startupBehavior', 'tabShape', 'tabStripPosition', 'compact', 'animations', 'reduceMotion', 'highContrast', 'uiFontScale', 'toolbarFontSize', 'tabMinWidth', 'showHomeButton', 'showDownloadsButton', 'showExtensionsButton', 'showIncognitoBadge', 'showMenuButton', 'language', 'defaultSearchEngine', 'blockAds', 'blockTrackers', 'blockScripts', 'httpsUpgrade', 'sendDnt', 'autoplayPolicy', 'pageFontSize', 'searchSuggestionsEnabled', 'openLinksInBackground', 'confirmCloseMultiple', 'showImages', 'forcePageTheme']
  for (const k of keys) if (s[k] !== undefined) safe[k] = s[k]
  return safe
}

function snapshot() {
  const s = store.settings()
  return {
    bookmarks: store.listBookmarks().map((b) => ({ ...b })),
    history: store.listHistory().map((h) => ({ ...h, ts: h.ts || 0 })),
    readingList: store.listReadingList().map((r) => ({ ...r, ts: r.ts || 0 })),
    workspaces: store.listWorkspaces().map((w) => ({ ...w, ts: w.ts || 0 })),
    tabGroups: store.tabGroups() || {},
    recentSearches: Array.isArray(store.recentSearches(1000)) ? store.recentSearches(1000) : [],
    sitePermissions: s.sitePermissions || {},
    siteShields: s.siteShields || {},
    settings: pickSettings(s),
  }
}

function importList(name, list) {
  if (name === 'bookmarks') store.replaceBookmarks(list)
  else if (name === 'history') store.replaceHistory(list)
  else if (name === 'readingList') store.replaceReadingList(list)
  else if (name === 'workspaces') store.replaceWorkspaces(list)
  else if (name === 'recentSearches') store.replaceRecentSearches(list)
}

function mergeList(local, remote, keyFn, tsFn, apply) {
  const map = new Map()
  for (const it of local) map.set(keyFn(it), it)
  for (const it of remote) {
    const k = keyFn(it)
    const cur = map.get(k)
    if (!cur) map.set(k, it)
    else if ((tsFn(it) || 0) > (tsFn(cur) || 0)) map.set(k, it)
  }
  apply(Array.from(map.values()))
}

function mergeRemote(remote) {
  if (!remote || typeof remote !== 'object') return
  for (const k of LIST_KEYS) {
    if (!remote[k] || !Array.isArray(remote[k])) continue
    const local = LOCAL_GET[k] ? LOCAL_GET[k]() : []
    if (k === 'bookmarks') mergeList(local, remote[k], (x) => String(x.id), (x) => x.ts || 0, (l) => importList('bookmarks', l))
    else if (k === 'history') mergeList(local, remote[k], (x) => String(x.url), (x) => x.ts || 0, (l) => importList('history', l))
    else if (k === 'readingList') mergeList(local, remote[k], (x) => String(x.id), (x) => x.ts || 0, (l) => importList('readingList', l))
    else if (k === 'workspaces') mergeList(local, remote[k], (x) => String(x.name), (x) => x.ts || 0, (l) => importList('workspaces', l))
  }
  if (Array.isArray(remote.recentSearches)) {
    const set = new Set()
    for (const q of store.recentSearches(1000)) set.add(q)
    for (const q of remote.recentSearches) set.add(q)
    importList('recentSearches', Array.from(set).slice(0, 100))
  }
  if (remote.tabGroups && typeof remote.tabGroups === 'object') store.setTabGroups(Object.assign({}, store.tabGroups(), remote.tabGroups))
  if (remote.sitePermissions && typeof remote.sitePermissions === 'object') store.setSettings({ sitePermissions: Object.assign({}, store.settings().sitePermissions || {}, remote.sitePermissions) })
  if (remote.siteShields && typeof remote.siteShields === 'object') store.setSettings({ siteShields: Object.assign({}, store.settings().siteShields || {}, remote.siteShields) })
  if (remote.settings && typeof remote.settings === 'object') store.setSettings(remote.settings)
}

async function syncNow() {
  const rec = current()
  if (!rec || rec.type !== 'cloud' || !rec.session || !rec.session.access_token) return status()
  const uid = jwtUid(rec.session.access_token)
  if (!uid) return status()
  const snap = snapshot()
  const ts = new Date().toISOString()
  const rows = Object.keys(snap).map((k) => ({ user_id: uid, key: k, payload: snap[k], updated_at: ts }))
  await supabase('/rest/v1/sync_data?on_conflict=user_id,key', { method: 'POST', auth: rec.session.access_token, body: rows, prefer: 'resolution=merge-duplicates' })
  rec.lastSync = Date.now()
  saveIndex()
  return status()
}

async function pullAndMerge() {
  const rec = current()
  if (!rec || rec.type !== 'cloud' || !rec.session || !rec.session.access_token) return
  const uid = jwtUid(rec.session.access_token)
  if (!uid) return
  const rows = await supabase('/rest/v1/sync_data?user_id=eq.' + uid + '&select=key,payload', { auth: rec.session.access_token })
  const remote = {}
  for (const r of rows || []) remote[r.key] = r.payload
  mergeRemote(remote)
  rec.lastSync = Date.now()
  saveIndex()
}

function scheduleSync() {
  const rec = current()
  if (!rec || rec.type !== 'cloud' || !rec.session || !rec.session.access_token) return
  clearTimeout(syncTimer)
  syncTimer = setTimeout(() => { syncNow().catch(() => {}) }, 3000)
}

// ---- Estado / info ----------------------------------------------------------

function status() {
  const rec = current()
  return {
    activeId: rec ? rec.id : null,
    activeName: rec ? rec.name : '',
    activeColor: rec ? rec.color : '',
    activeType: rec ? rec.type : null,
    activeEmail: rec ? (rec.email || '') : '',
    cloud: !!rec && rec.type === 'cloud' && !!rec.session,
    cloudConfigured: cloudCfg.configured(),
    providers: providerList,
    lastSync: rec && rec.lastSync ? rec.lastSync : null,
    avatar: rec ? rec.avatar || '' : '',
    avatarSource: rec ? (rec.avatarSource || 'local') : 'local',
    profiles: index.profiles.map((p) => ({ id: p.id, name: p.name, color: p.color, type: p.type, email: p.email || '', avatar: p.avatar || '', avatarSource: p.avatarSource || 'local' })),
  }
}

// ---- Inicialización ---------------------------------------------------------

function migrateLegacy() {
  if (index.profiles.length || !store.settings().profileCreated) return
  const id = newId('local')
  const dir = profileDir(id)
  fs.mkdirSync(dir, { recursive: true })
  try {
    dbmod.close()
    const src = path.join(app.getPath('userData'), 'nixer.db')
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(dir, 'nixer.db'))
      for (const ext of ['-wal', '-shm']) {
        const f = src + ext
        if (fs.existsSync(f)) fs.copyFileSync(f, path.join(dir, 'nixer.db') + ext)
      }
    }
  } catch {}
  index.profiles.push({ id, name: store.settings().profileName || 'Por defecto', color: store.settings().profileColor || '#6c7bff', type: 'local', createdAt: Date.now(), lastUsed: Date.now() })
  index.activeId = id
  saveIndex()
  store.setDataDir(dir)
}

function init() {
  loadIndex()
  migrateLegacy()
  if (index.activeId && getProfile(index.activeId)) {
    store.setDataDir(profileDir(index.activeId))
    // Migración: cualquier perfil existente ya está "creado" -> la App abre el
    // inicio, nunca la pestaña welcome (perfiles creados antes de este flag).
    const rec = getProfile(index.activeId)
    const s = store.settings()
    if (!s.profileCreated || !s.profileName) {
      store.setSettings({ profileCreated: true, profileName: rec.name, profileColor: rec.color })
    }
  }
  store.onDataChange((name) => {
    if (SYNC_KEYS.includes(name)) scheduleSync()
  })
}

module.exports = {
  init,
  status,
  current,
  list: () => index.profiles.map((p) => ({ id: p.id, name: p.name, color: p.color, type: p.type, email: p.email || '' })),
  hasActive: () => !!index.activeId && !!getProfile(index.activeId),
  ensureDefault,
  createLocal,
  updateProfile,
  removeProfile,
  switchTo,
  signupCloud,
  signinCloud,
  signoutCloud,
  loginWithProvider,
  syncNow,
  pullAndMerge,
  cloudConfigured: () => cloudCfg.configured(),
}
