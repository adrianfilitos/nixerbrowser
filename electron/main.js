const { app, BrowserWindow, ipcMain, session, shell, dialog, webContents, screen, net, Menu, nativeTheme, clipboard } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')
const { DEV_SERVER_URL, PRIVATE_PARTITION, PROFILE, CHROME_HEIGHT } = require('./constants')

const CHROME_MAJOR = String(process.versions.chrome).split('.')[0]

app.commandLine.appendSwitch('js-flags', '--expose-gc')
app.commandLine.appendSwitch('disable-features', 'OptimizationHints,MediaRouter,TranslateUI,NetworkTimeServiceQuerying,WebRtcLocalEcho,FontSrcLocalMatching,HistoryManipulationIntervention')

app.setName('Nixer Browser')
app.setAppUserModelId('com.nixer.browser')
if (process.env.SMOKE === '1' && !process.env.NIXER_USER_DATA) {
  process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-smoke-profile')
}
const userDataBase = PROFILE === 'default' ? path.join(app.getPath('appData'), 'navegador') : path.join(app.getPath('appData'), 'navegador-profiles', PROFILE)
app.setPath('userData', process.env.NIXER_USER_DATA || userDataBase)

const store = require('./store')
const adblock = require('./adblock')
const ai = require('./ai')
const nixer = require('./nixer')
const tabGuards = require('./tab-guards')
const popups = require('./popups')
const ctx = require('./ctx')
const util = require('./util')
const defaultBrowser = require('./default-browser')
const safeBrowsing = require('./safe-browsing')
const system = require('./system')
const downloads = require('./downloads')
const extensions = require('./extensions')
const reader = require('./reader')
const search = require('./search')
const menus = require('./menu')
const pageStyle = require('./page-style')
const sqlite = require('./sqlite')
const translate = require('./translate')
const overlayMod = require('./overlay')
const profiles = require('./profiles')
const cursor = require('./cursor')
const tabs = require('./tabs')

let dragState = null
let dragTarget = null // { wc, winCtx, attached, entered }

// ---- Detección de cierre anómalo (crash recovery) ---------------------------
// Si la app no se cierra de forma limpia, el marcador 'clean-exit' no existe:
// en el siguiente arranque se ofrece "¿Restaurar páginas?".
function cleanExitMarker() {
  return path.join(app.getPath('userData'), 'clean-exit')
}

function markCleanExit() {
  try { fs.writeFileSync(cleanExitMarker(), String(Date.now())) } catch {}
}

let abnormalClose = false

function detectAbnormalClose() {
  abnormalClose = !fs.existsSync(cleanExitMarker())
  try { fs.rmSync(cleanExitMarker(), { force: true }) } catch {}
}

function dragData() {
  const st = dragState || {}
  return {
    items: [
      { mimeType: 'text/plain', data: st.url || '' },
      { mimeType: 'application/x-nixer-tab', data: JSON.stringify({ tabId: st.tabId, url: st.url, title: st.title }) },
    ],
    dragOperationsMask: 1,
  }
}

function windowAtCursor() {
  const p = screen.getCursorScreenPoint()
  return windowAtPoint(p.x, p.y)
}

// Fuerza el repintado de una vista tras re-parentarla entre ventanas (Windows
// deja la WebContentsView en blanco/congelada hasta que se tocan los bounds).
function nudgeView(view, delay) {
  if (!view) return
  const run = () => {
    try {
      const b = view.getBounds()
      view.setBounds({ x: b.x, y: b.y, width: b.width + 1, height: b.height })
      view.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height })
    } catch {}
    try { if (view.webContents && !view.webContents.isDestroyed()) view.webContents.focus() } catch {}
  }
  setTimeout(run, typeof delay === 'number' ? delay : 80)
}

function pointInBounds(b, x, y) {
  return b && x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height
}

function windowAtPoint(x, y, exclude) {
  let hit = null
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed() || !w.isVisible() || w === exclude) continue
    const b = w.getContentBounds()
    if (pointInBounds(b, x, y)) {
      if (w.isFocused()) return { win: w, x: x - b.x, y: y - b.y }
      hit = { win: w, x: x - b.x, y: y - b.y }
    }
  }
  return hit
}

async function dispatchDrag(type, x, y) {
  const t = dragTarget
  if (!t || !t.attached) return false
  try {
    await t.wc.debugger.sendCommand('Input.dispatchDragEvent', { type, x: Math.round(x), y: Math.round(y), data: dragData(), modifiers: 0 })
    return true
  } catch (err) {
    if (process.env.DBG_DRAG) console.log('DISPATCH_ERR', type, err && err.message)
    t.attached = false
    try { t.wc.debugger.detach() } catch {}
    return false
  }
}

function attachDragTarget(wc, winCtx) {
  if (dragTarget && dragTarget.wc === wc) return
  closeDragTarget()
  dragTarget = { wc, winCtx, attached: false, entered: false }
  try {
    wc.debugger.attach('1.3')
    dragTarget.attached = true
  } catch (err) {
    dragTarget.attached = false
    if (process.env.DBG_DRAG) console.log('ATTACH_ERR', err && err.message)
  }
}

function closeDragTarget() {
  if (dragTarget) {
    if (dragTarget.winCtx) ctx.sendUi(dragTarget.winCtx, 'drag-highlight', false)
    if (dragTarget.attached) {
      try { dragTarget.wc.debugger.detach() } catch {}
    }
    dragTarget = null
  }
}

function dockInto(targetCtx) {
  if (!dragState || !targetCtx) return
  const st = dragState
  const srcCtx = st.win ? ctx.windows.get(st.win) : null
  if (st.tabId && srcCtx && srcCtx !== targetCtx) {
    dockTab(srcCtx, targetCtx, st.tabId)
  } else if (st.url) {
    ctx.sendUi(targetCtx, 'open-tab-bg', st.url)
    if (srcCtx && st.tabId) ctx.sendUi(srcCtx, 'close-tab-by-id', st.tabId)
  }
  dragState = null
}

// Mueve una pestaña viva a otra ventana re-parentando su WebContentsView (sin recargar).
function dockTab(srcCtx, targetCtx, tabId) {
  const tab = tabs.getTab(srcCtx, tabId)
  if (!tab || tab.wc.isDestroyed() || !targetCtx || !targetCtx.win || targetCtx.win.isDestroyed()) return
  srcCtx.tabs.delete(tab.id)
  tab.winCtx = targetCtx
  targetCtx.tabs.set(tab.id, tab)
  try { targetCtx.win.contentView.addChildView(tab.view) } catch {}
  try { tab.view.setVisible(false) } catch {}
  ctx.sendUi(srcCtx, 'close-tab-by-id', tab.id)
  const sendAdopt = () => {
    if (targetCtx.uiReady && !targetCtx.win.isDestroyed()) {
      ctx.sendUi(targetCtx, 'tab-adopted', { id: tab.id, wcId: tab.wc.id, url: tab.wc.getURL(), title: tab.wc.getTitle() })
      nudgeView(tab.view)
      return true
    }
    return false
  }
  if (sendAdopt()) return
  let tries = 0
  const t = setInterval(() => {
    tries++
    if (sendAdopt()) clearInterval(t)
    else if (tries > 100 || targetCtx.win.isDestroyed()) clearInterval(t)
  }, 50)
}

function openUrlInWindow(wctx, url) {
  if (!wctx || !url) return
  const wc = ctx.ui(wctx)
  if (!wc || wc.isDestroyed()) return
  const send = () => {
    if (!wc.isDestroyed()) ctx.sendUi(wctx, 'open-tab', url)
    if (wctx.win && !wctx.win.isDestroyed()) {
      try { wctx.win.show(); wctx.win.focus() } catch {}
    }
  }
  if (wctx.uiReady) { send(); return }
  let tries = 0
  const t = setInterval(() => {
    tries++
    if (wctx.uiReady) { clearInterval(t); send() }
    else if (tries > 100 || wc.isDestroyed()) clearInterval(t)
  }, 50)
}

function moveTabToNewWindow(srcCtx, st, pos) {
  const wctx = createWindow({ incognito: srcCtx ? srcCtx.incognito : false, x: pos && pos.x, y: pos && pos.y })
  openUrlInWindow(wctx, st.url)
  if (srcCtx && st.tabId) ctx.sendUi(srcCtx, 'close-tab-by-id', st.tabId)
  dragState = null
  return wctx
}

function detachFromDrag(srcCtx) {
  if (!dragState || !dragState.url) return
  if (dragState.tabId && srcCtx) tearOffTab(srcCtx, dragState.tabId)
  else moveTabToNewWindow(srcCtx, dragState)
}

function tearoffWindowAt(sx, sy) {
  const d = screen.getDisplayNearestPoint({ x: sx, y: sy })
  const wa = d.workArea
  let x = Math.round(sx - 130)
  let y = Math.round(sy - 60)
  x = Math.max(wa.x, Math.min(x, wa.x + wa.width - 320))
  y = Math.max(wa.y, Math.min(y, wa.y + wa.height - 300))
  return { x, y }
}

function tearOff(srcCtx, sx, sy) {
  if (!dragState) return
  const st = dragState
  const p = screen.getCursorScreenPoint()
  const cx = typeof sx === 'number' ? sx : p.x
  const cy = typeof sy === 'number' ? sy : p.y
  if (st.tabId && srcCtx) {
    tearOffTab(srcCtx, st.tabId, cx, cy)
  } else {
    const pos = tearoffWindowAt(cx, cy)
    moveTabToNewWindow(srcCtx, st, pos)
  }
  closeDragTarget()
}

function tearOffTab(wctx, id, x, y) {
  const tab = tabs.getTab(wctx, id)
  if (!tab || tab.wc.isDestroyed()) return
  const p = screen.getCursorScreenPoint()
  const cx = typeof x === 'number' ? x : p.x
  const cy = typeof y === 'number' ? y : p.y
  const pos = tearoffWindowAt(cx, cy)
  const newWctx = createWindow({ incognito: wctx.incognito, x: pos.x, y: pos.y })
  newWctx.awaitingTab = true
  wctx.tabs.delete(tab.id)
  tab.winCtx = newWctx
  newWctx.tabs.set(tab.id, tab)
  try { newWctx.win.contentView.addChildView(tab.view) } catch {}
  try {
    const [w, h] = newWctx.win.getContentSize()
    tab.view.setBounds({ x: 0, y: CHROME_HEIGHT, width: w, height: Math.max(200, h - CHROME_HEIGHT) })
  } catch {}
  try { tab.view.setVisible(true) } catch {}
  ctx.sendUi(wctx, 'close-tab-by-id', tab.id)
  const trySend = () => {
    if (newWctx.uiReady && !newWctx.win.isDestroyed()) {
      ctx.sendUi(newWctx, 'tab-adopted', { id: tab.id, wcId: tab.wc.id, url: tab.wc.getURL(), title: tab.wc.getTitle() })
      try { newWctx.win.show(); newWctx.win.focus() } catch {}
      nudgeView(tab.view)
      return true
    }
    return false
  }
  if (trySend()) return
  let tries = 0
  const t = setInterval(() => {
    tries++
    if (trySend()) clearInterval(t)
    else if (tries > 100 || newWctx.win.isDestroyed()) clearInterval(t)
  }, 50)
}

if (store.settings().hardwareAcceleration === false) {
  app.disableHardwareAcceleration()
}
if (store.settings().gpuRasterization === false) {
  app.commandLine.appendSwitch('disable-gpu-rasterization')
}

// Fuerza el tema de las páginas: nativeTheme.themeSource hace que Chromium
// evalúe prefers-color-scheme acorde para TODOS los webContents, en vivo.
function applyForcedTheme() {
  const t = store.settings().forcePageTheme
  try { nativeTheme.themeSource = t === 'dark' ? 'dark' : t === 'light' ? 'light' : 'system' } catch {}
}
applyForcedTheme()

nixer.registerScheme()

const gotLock = app.requestSingleInstanceLock(PROFILE)
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
      const c = ctx.windows.get(win)
      if (c) ctx.sendUi(c, 'open-tab', url)
    }
  })
}

// ---- Seguridad SSL/TLS ----------------------------------------------------
// Certificados que fallaron validación (emitidos por CA o no): se registran por
// origen y NUNCA se omiten. El indicador del candado consulta este estado real.
const insecureOrigins = new Map() // origin -> { code, ts }

app.on('certificate-error', (event, _wc, url, error, _certificate, callback) => {
  let origin = ''
  try { origin = new URL(url).origin } catch {}
  if (origin) insecureOrigins.set(origin, { code: error, ts: Date.now() })
  // Nunca hacer bypass: se bloquea la navegación y Chromium muestra su página
  // de error de conexión.
  callback(false)
})

function guardState(origin) {
  const s = store.settings()
  const shields = (s.siteShields && s.siteShields[origin]) || {}
  return {
    blockAds: shields.blockAds !== undefined ? shields.blockAds : s.blockAds,
    blockTrackers: shields.blockTrackers !== undefined ? shields.blockTrackers : s.blockTrackers,
    blockScripts: shields.blockScripts !== undefined ? shields.blockScripts : s.blockScripts,
    blockThirdPartyCookies: shields.blockCookies !== undefined ? shields.blockCookies : s.blockThirdPartyCookies,
    blockImages: s.showImages === false,
    sendDnt: s.sendDnt,
    httpsUpgrade: s.httpsUpgrade,
  }
}

// ---- IA: aumento de contexto (grounding + @pestañas + página actual) ------
async function pageTextOf(wc) {
  if (!wc || wc.isDestroyed()) return ''
  try {
    const id = await reader.extractReader(wc)
    const content = id ? reader.getReader(id) : null
    return (content && content.text) || ''
  } catch {
    return ''
  }
}

async function augmentAiMessages(messages, wctx) {
  const list = Array.isArray(messages) ? messages.slice() : []
  const last = [...list].reverse().find((m) => m && m.role === 'user')
  const q = String(last && last.content || '').trim()
  if (!q) return list

  const tabsArr = wctx ? Array.from(wctx.tabs.values()) : []
  const context = []
  const used = new Set()

  // @pestañas: completar por título/URL; @current / "esta página" usa la activa.
  const ats = String(q).match(/@([\wáéíóúñÁÉÍÓÚÑ][\wáéíóúñÁÉÍÓÚÑ.\-]{0,40})/g) || []
  for (const at of ats) {
    const token = at.slice(1).trim().toLowerCase()
    if (!token) continue
    if (['current', 'actual', 'esta', 'pagina', 'página', 'this', 'page'].includes(token)) {
      const awc = wctx && ctx.activeWc ? ctx.activeWc(wctx) : null
      if (awc && !awc.isDestroyed() && /^https?:/.test(awc.getURL() || '')) {
        let title = ''
        try { title = awc.getTitle() || '' } catch {}
        const text = (await pageTextOf(awc)).slice(0, 6000)
        context.push('Página actual:\nTítulo: ' + title + '\nURL: ' + (awc.getURL() || '') + '\n\n' + text)
      }
      continue
    }
    const match = tabsArr.find((t) => {
      let title = ''
      let url = ''
      try { title = (t.wc.getTitle() || '').toLowerCase() } catch {}
      try { url = (t.wc.getURL() || '').toLowerCase() } catch {}
      return title.includes(token) || url.includes(token)
    })
    if (match && !used.has(match.id)) {
      used.add(match.id)
      let title = ''
      let url = ''
      try { title = match.wc.getTitle() || '' } catch {}
      try { url = match.wc.getURL() || '' } catch {}
      const text = (await pageTextOf(match.wc)).slice(0, 6000)
      context.push('Pestaña @"' + token + '":\nTítulo: ' + title + '\nURL: ' + url + '\n\n' + text)
    }
  }
  // Nombres de pestaña con espacios insertados por @completion: coincidencia por
  // título completo tras un '@'.
  if (!used.size || true) {
    const ql = String(q).toLowerCase()
    for (const t of tabsArr) {
      if (used.has(t.id)) continue
      let title = ''
      try { title = (t.wc.getTitle() || '').toLowerCase() } catch {}
      if (title && ql.includes('@' + title)) {
        used.add(t.id)
        let url = ''
        try { url = t.wc.getURL() || '' } catch {}
        const text = (await pageTextOf(t.wc)).slice(0, 6000)
        context.push('Pestaña: ' + title + '\nURL: ' + url + '\n\n' + text)
      }
    }
  }

  let system = 'Eres el asistente de Nixer Browser. Responde en español, de forma concisa y útil, con datos actuales.\n' +
    'Reglas: si mencionas una URL usa el formato [texto](url). No digas que no puedes navegar ni abrir páginas: tienes acceso a resultados de búsqueda y al contexto de las pestañas y de la página actual.\n'

  const alreadyHasSearch = /resultados de búsqueda/i.test(String(last.content || ''))
  if (!alreadyHasSearch) {
    const results = await ai.searchWeb(q.slice(0, 300)).catch(() => [])
    if (results && results.length) {
      system += '\nResultados de búsqueda para "' + q + '":\n' +
        results.map((r, i) => (i + 1) + '. ' + (r.title || '') + ' — ' + (r.url || '') + '\n' + (r.snippet || '')).join('\n\n')
    } else {
      system += '\n(No se obtuvieron resultados de búsqueda web para esta consulta.)\n'
    }
  }
  if (context.length) {
    system += '\n\nContexto de las pestañas:\n' + context.join('\n\n---\n\n')
  }

  return [{ role: 'system', content: system }, ...list]
}

function createWindow({ incognito = false, x, y, initial = false } = {}) {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    x,
    y,
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
  const wctx = { id: ctx.nextWindow(), win, incognito, activeWcId: null, uiReady: false, initial: !!initial, awaitingTab: false, tabs: new Map(), lastLayout: [] }
  ctx.registerWindow(win, wctx)

  if (app.isPackaged) win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  else win.loadURL(DEV_SERVER_URL)
  win.webContents.on('did-fail-load', (_e, code) => {
    if (!app.isPackaged && (code === -105 || code === -102)) {
      win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
    }
  })
  try {
    win.webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'mouseDown') {
        try { popups.hideAllForWindow(wctx) } catch {}
      }
    })
  } catch {}
  win.webContents.on('did-finish-load', () => {
    if (!win.isDestroyed() && process.env.SMOKE !== '1') {
      win.show()
      if (store.settings().startMinimized) win.minimize()
    }
  })

  win.on('maximize', () => { const t = ctx.ui(wctx); if (t && !t.isDestroyed()) t.send('win-maximized', true) })
  win.on('unmaximize', () => { const t = ctx.ui(wctx); if (t && !t.isDestroyed()) t.send('win-maximized', false) })
  win.on('resize', () => {
    // Al redimensionar la ventana se recalculan los bounds de las pestañas
    // respetando la franja superior reservada (CHROME_HEIGHT): la página nunca
    // se superpone a la barra de herramientas ni se sale por la parte inferior.
    try { tabs.reapplyLayout(wctx) } catch {}
  })
  win.on('close', (e) => {
    if (!incognito && store.settings().minimizeToTray && !system.isQuitting()) {
      e.preventDefault()
      win.hide()
      system.setupTray()
    }
  })
  win.on('closed', () => {
    ctx.unregisterWindow(win)
    popups.hideAllForWindow(wctx)
    cursor.hideAll(wctx)
    if (wctx.tabs) tabs.closeAll(wctx)
    if (incognito) {
      const ses = session.fromPartition(PRIVATE_PARTITION)
      try { ses.clearStorageData() } catch {}
      try { ses.clearCache() } catch {}
    }
  })
  return wctx
}

function broadcastToast(text, kind) {
  for (const wc of webContents.getAllWebContents()) {
    if (wc.getType() === 'window') wc.send('ui-action', 'ui-toast', { text, kind: kind || 'info' })
  }
}

// Ventana de entrada (onboarding): standalone, sin el navegador.
let onboardingWin = null

function openOnboarding() {
  if (onboardingWin && !onboardingWin.isDestroyed()) {
    onboardingWin.show()
    onboardingWin.focus()
    return onboardingWin
  }
  onboardingWin = new BrowserWindow({
    width: 500,
    height: 660,
    frame: false,
    resizable: false,
    show: false,
    backgroundColor: '#101014',
    webPreferences: {
      preload: path.join(__dirname, 'view-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  onboardingWin.loadFile(path.join(__dirname, '..', 'pages', 'onboarding.html'))
  onboardingWin.once('ready-to-show', () => { if (onboardingWin && !onboardingWin.isDestroyed()) onboardingWin.show() })
  onboardingWin.on('closed', () => { onboardingWin = null })
  return onboardingWin
}

function registerIpc() {
  // ---- Perfiles / cuentas ---------------------------------------------------
  function notifyProfilesChanged() {
    util.broadcastSettings()
    for (const c of ctx.windows.values()) {
      const ui = ctx.ui(c)
      if (ui && !ui.isDestroyed()) ui.send('ui-action', 'profiles-changed')
    }
    // Si la puerta de entrada sigue abierta, cerrarla y abrir el navegador.
    if (onboardingWin && !onboardingWin.isDestroyed() && profiles.hasActive()) {
      onboardingWin.destroy()
      onboardingWin = null
      try {
        if (BrowserWindow.getAllWindows().length === 0) createWindow({ initial: true })
      } catch (e) {
        console.log('PROFILE_WIN_ERR', e && e.message)
      }
    }
  }

  ipcMain.handle('profiles:status', () => profiles.status())
  ipcMain.handle('profiles:list', () => profiles.list())
  ipcMain.handle('profiles:create-local', (_e, name, color) => {
    const r = profiles.createLocal(name, color)
    notifyProfilesChanged()
    return r
  })
  ipcMain.handle('profiles:switch', (_e, id) => {
    const r = profiles.switchTo(id)
    notifyProfilesChanged()
    return r
  })
  ipcMain.handle('profiles:update', (_e, id, patch) => profiles.updateProfile(id, patch))
  ipcMain.handle('profiles:remove', (_e, id) => {
    const r = profiles.removeProfile(id)
    notifyProfilesChanged()
    return r
  })
  ipcMain.handle('profiles:signup-cloud', async (_e, email, password, adopt) => {
    const r = await profiles.signupCloud(email, password, !!adopt)
    notifyProfilesChanged()
    return r
  })
  ipcMain.handle('profiles:signin-cloud', async (_e, email, password, adopt) => {
    const r = await profiles.signinCloud(email, password, !!adopt)
    notifyProfilesChanged()
    return r
  })
  ipcMain.handle('profiles:signin-provider', async (_e, provider, adopt) => {
    const r = await profiles.loginWithProvider(provider, !!adopt)
    notifyProfilesChanged()
    return r
  })
  ipcMain.handle('profiles:signout', () => profiles.signoutCloud())
  ipcMain.handle('profiles:sync-now', async () => profiles.syncNow())

  ipcMain.on('win-minimize', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.minimize() })
  ipcMain.on('win-toggle-maximize', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) { if (w.isMaximized()) w.unmaximize(); else w.maximize() } })
  ipcMain.on('win-close', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.close() })
  ipcMain.on('toggle-fullscreen', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.setFullScreen(!w.isFullScreen()) })
  ipcMain.on('create-window', (e, incognito, url) => {
    const c = createWindow({ incognito: !!incognito })
    if (url && c) openUrlInWindow(c, url)
  })
  ipcMain.handle('reader:get', (_e, id) => reader.getReader(id))

  ipcMain.handle('view-info', () => {
    return {
      preload: 'file://' + path.join(__dirname, 'view-preload.js').replace(/\\/g, '/'),
      newtab: 'nixer://newtab',
      welcome: 'nixer://welcome',
      pages: 'nixer://pages/',
      privatePartition: PRIVATE_PARTITION,
    }
  })
  ipcMain.handle('window-info', (e) => {
    const c = ctx.ctxFor(e)
    return c ? { incognito: c.incognito, id: c.id, initial: !!c.initial, awaitingTab: !!c.awaitingTab, crash: abnormalClose } : { incognito: false, id: 0, initial: false, awaitingTab: false, crash: abnormalClose }
  })
  ipcMain.on('drag-start', (e, info) => {
    const c = ctx.ctxFor(e)
    if (c && info) dragState = { ...info, win: c.win, winId: c.id }
  })
  ipcMain.on('drag-move', async (_e, sx, sy) => {
    if (!dragState) return
    const hit = (typeof sx === 'number' && typeof sy === 'number') ? windowAtPoint(sx, sy, dragState.win) : windowAtCursor()
    if (process.env.DBG_DRAG) console.log('DRAG_MOVE', JSON.stringify({ sx, sy, hit: hit && ctx.windows.get(hit.win) && ctx.windows.get(hit.win).id, srcId: dragState.winId, winSet: BrowserWindow.getAllWindows().map((w) => { const b = w.getContentBounds(); return { id: ctx.windows.get(w) && ctx.windows.get(w).id, vis: w.isVisible(), b } }) }))
    if (hit) {
      const targetCtx = ctx.windows.get(hit.win)
      attachDragTarget(hit.win.webContents, targetCtx)
      if (dragTarget && dragTarget.attached) {
        const first = !dragTarget.entered
        await dispatchDrag(first ? 'dragEnter' : 'dragOver', hit.x, hit.y)
        dragTarget.entered = true
        if (first) ctx.sendUi(targetCtx, 'drag-highlight', true)
      } else {
        ctx.sendUi(targetCtx, 'drag-highlight', true)
      }
    } else {
      closeDragTarget()
    }
  })
  ipcMain.on('drag-drop', async (e, sx, sy) => {
    const srcCtx = ctx.ctxFor(e)
    if (!dragState) { closeDragTarget(); return }
    const x = (typeof sx === 'number') ? sx : screen.getCursorScreenPoint().x
    const y = (typeof sy === 'number') ? sy : screen.getCursorScreenPoint().y
    const hit = windowAtPoint(x, y, dragState.win)
    const overSrc = dragState.win && !dragState.win.isDestroyed() && pointInBounds(dragState.win.getContentBounds(), x, y)
    if (hit) {
      const targetCtx = ctx.windows.get(hit.win)
      if (dragTarget && dragTarget.wc === hit.win.webContents && dragTarget.attached) {
        await dispatchDrag('drop', hit.x, hit.y)
      } else {
        dockInto(targetCtx)
      }
    } else if (!overSrc) {
      detachFromDrag(srcCtx)
    }
    closeDragTarget()
    setTimeout(() => { dragState = null }, 500)
  })
  ipcMain.on('drag-cancel', () => { closeDragTarget(); dragState = null })
  ipcMain.on('drag-tearoff', (e, sx, sy) => {
    const srcCtx = ctx.ctxFor(e)
    tearOff(srcCtx, typeof sx === 'number' ? sx : undefined, typeof sy === 'number' ? sy : undefined)
  })
  ipcMain.handle('get-drag-state', () => dragState ? { winId: dragState.winId } : null)
  ipcMain.handle('dock-dragged', (e) => {
    const target = ctx.ctxFor(e)
    if (!target || !dragState || dragState.winId === target.id) return false
    dockInto(target)
    return true
  })
  ipcMain.on('set-active-wc', (e, wcId) => {
    const c = ctx.ctxFor(e)
    if (c) c.activeWcId = Number(wcId) || null
    const eng = extensions.getEngine()
    if (eng && wcId) {
      const w = webContents.fromId(Number(wcId))
      if (w && w.session === session.defaultSession) eng.selectTab(w)
    }
  })
  ipcMain.on('cursor:move', (e, x, y, visible) => {
    const c = ctx.ctxFor(e)
    if (c) cursor.update(c, x, y, visible)
  })
  ipcMain.on('ui-ready', (e) => {
    const c = ctx.ctxFor(e)
    if (c) c.uiReady = true
  })
  ipcMain.handle('tabs:create', (e, payload) => {
    const c = ctx.ctxFor(e)
    if (!c) return { wcId: 0 }
    return tabs.createTab(c, { id: payload && payload.id, src: payload && payload.src, partition: c.incognito ? PRIVATE_PARTITION : undefined, preload: path.join(__dirname, 'view-preload.js') })
  })
  ipcMain.on('tabs:close', (e, id) => { const c = ctx.ctxFor(e); if (c) tabs.closeTab(c, id) })
  ipcMain.on('tabs:close-force', (e, id) => { const c = ctx.ctxFor(e); if (c) tabs.forceCloseTab(c, id) })
  ipcMain.on('tabs:load', (e, id, url) => { const c = ctx.ctxFor(e); if (c) tabs.loadTab(c, id, url) })
  ipcMain.on('tabs:reload', (e, id, noCache) => { const c = ctx.ctxFor(e); if (c) tabs.reloadTab(c, id, noCache) })
  ipcMain.on('tabs:stop', (e, id) => { const c = ctx.ctxFor(e); if (c) tabs.stopTab(c, id) })
  ipcMain.on('tabs:back', (e, id) => { const c = ctx.ctxFor(e); if (c) tabs.backTab(c, id) })
  ipcMain.on('tabs:forward', (e, id) => { const c = ctx.ctxFor(e); if (c) tabs.forwardTab(c, id) })
  ipcMain.handle('tabs:nav-state', (e, id) => { const c = ctx.ctxFor(e); return c ? tabs.navState(c, id) : { canGoBack: false, canGoForward: false, isLoading: false } })
  ipcMain.handle('tabs:zoom-get', (e, id) => { const c = ctx.ctxFor(e); return c ? tabs.zoomGet(c, id) : 1 })
  ipcMain.on('tabs:zoom-set', (e, id, factor) => { const c = ctx.ctxFor(e); if (c) tabs.zoomSet(c, id, factor) })
  ipcMain.on('tabs:mute', (e, id, muted) => { const c = ctx.ctxFor(e); if (c) tabs.muteTab(c, id, muted) })
  ipcMain.on('tabs:find', (e, id, text, findNext) => { const c = ctx.ctxFor(e); if (c) tabs.findTab(c, id, text, { findNext: !!findNext }) })
  ipcMain.on('tabs:stop-find', (e, id, action) => { const c = ctx.ctxFor(e); if (c) tabs.stopFindTab(c, id, action) })
  ipcMain.on('tabs:input', (e, id, ev) => { const c = ctx.ctxFor(e); if (c) tabs.inputTab(c, id, ev) })
  ipcMain.handle('tabs:execute', (e, id, code) => { const c = ctx.ctxFor(e); return c ? tabs.executeTab(c, id, code) : null })
  ipcMain.handle('tabs:get-url', (e, id) => { const c = ctx.ctxFor(e); return c ? tabs.getUrl(c, id) : '' })
  ipcMain.handle('tabs:get-title', (e, id) => { const c = ctx.ctxFor(e); return c ? tabs.getTitle(c, id) : '' })
  ipcMain.handle('tabs:get-wc', (e, id) => { const c = ctx.ctxFor(e); return c ? tabs.getWcId(c, id) : 0 })
  ipcMain.on('tabs:layout', (e, visible) => { const c = ctx.ctxFor(e); if (c) tabs.setLayout(c, visible && visible.visible) })
  ipcMain.on('tabs:tearoff', (e, id, x, y) => { const c = ctx.ctxFor(e); if (c) tearOffTab(c, id, x, y) })
  ipcMain.on('popup:show', (e, opts) => { const c = ctx.ctxFor(e); if (c) popups.showPopup(c, opts) })
  ipcMain.on('popup:hide', (e, key) => { const c = ctx.ctxFor(e); if (c) popups.hidePopup(c, key) })
  ipcMain.on('popup:update', (e, key, payload) => { const c = ctx.ctxFor(e); if (c) popups.updateContent(c, key, payload) })
  ipcMain.on('popup-action', (e, key, data) => {
    const c = popups.wctxForWc(e.sender)
    if (c) {
      const ui = ctx.ui(c)
      if (ui && !ui.isDestroyed()) ui.send('popup-action', { key, data })
      // Los popups interactivos (paleta, buscar, escudos, IA, tareas…) se
      // mantienen abiertos tras una acción; solo se cierran explícitamente.
      if (!popups.isKeepOpen(key)) popups.hidePopup(c, key)
    }
  })
  ipcMain.on('popup-close', (e, key) => {
    const c = popups.wctxForWc(e.sender)
    if (c) popups.hidePopup(c, key)
  })
  ipcMain.on('popup:close-all', (e) => {
    const c = ctx.ctxFor(e)
    if (c) popups.hideAllForWindow(c)
  })
  ipcMain.on('add-history', (e, entry) => {
    const c = ctx.ctxFor(e)
    if (!c) return
    store.addHistory({ url: entry.url, title: entry.title, ts: Date.now() })
  })

  ipcMain.on('history:update-title', (_e, url, title) => {
    if (url && title) store.updateHistoryTitle(url, title)
  })

  ipcMain.on('create-tab', (e, url) => {
    const c = ctx.ctxFor(e)
    if (c) ctx.sendUi(c, 'open-tab', url || '')
  })

  ipcMain.on('open-page', (e, key) => {
    const c = ctx.ctxFor(e)
    if (c) ctx.sendUi(c, 'open-page', key)
  })

  ipcMain.on('login-submit', (e, cred) => {
    const c = ctx.ctxFor(e)
    if (!c || c.incognito || !store.settings().offerPasswordSave) return
    const target = ctx.ui(c)
    if (target && cred && cred.origin && !store.hasPassword(cred.origin)) {
      target.send('save-password-prompt', cred)
    }
  })
  ipcMain.on('password-save', (e, cred) => { const c = ctx.ctxFor(e); if (cred && (!c || !c.incognito) && store.settings().offerPasswordSave) store.addPassword(cred) })
  ipcMain.on('autofill-request', (e, payload) => {
    const cred = payload && payload.origin && store.settings().autofillEnabled ? store.getPassword(payload.origin) : null
    e.sender.send('autofill-response', cred)
  })
  ipcMain.on('autofill-form', (e) => {
    const c = ctx.ctxFor(e)
    const w = c && ctx.activeWc(c)
    if (!w) return
    const p = store.decryptProfile(store.settings().autofillProfile)
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
  ipcMain.handle('passwords:check', async () => {
    const list = store.listPasswords()
    const results = []
    for (const p of list) {
      if (!p.password) continue
      const sha = crypto.createHash('sha1').update(p.password).digest('hex').toUpperCase()
      const prefix = sha.slice(0, 5)
      const suffix = sha.slice(5)
      let breached = false
      try {
        const res = await net.fetch('https://api.pwnedpasswords.com/range/' + prefix, { signal: AbortSignal.timeout(8000) })
        const body = await res.text()
        breached = body.split(/\r?\n/).some((l) => l.split(':')[0].toUpperCase() === suffix)
      } catch {}
      if (breached) results.push({ origin: p.origin, username: p.username })
      await new Promise((r) => setTimeout(r, 350))
    }
    return results
  })
  ipcMain.handle('passwords:import', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'CSV', extensions: ['csv'] }] })
    if (canceled || !filePaths || !filePaths[0]) return 0
    const text = fs.readFileSync(filePaths[0], 'utf8')
    const lines = text.split(/\r?\n/).filter((l) => l.trim())
    let count = 0
    for (const line of lines.slice(1)) {
      const cols = line.split(',')
      const origin = (cols[0] || '').trim()
      const username = (cols[1] || '').trim()
      const password = (cols[2] || '').trim()
      if (origin && password) { store.addPassword({ origin, username, password }); count++ }
    }
    return count
  })

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
    const c = ctx.currentCtx()
    if (sesExt && c) { ctx.sendUi(c, 'open-tab', 'chrome-extension://' + sesExt.id + '/' + page); return true }
    return false
  })
  ipcMain.handle('extensions:open-homepage', (_e, id) => {
    const ext = store.listExtensions().find((x) => x.id === id)
    if (!ext) return false
    let manifest = null
    try { manifest = JSON.parse(fs.readFileSync(path.join(ext.folder, 'manifest.json'), 'utf8')) } catch {}
    if (!manifest || !manifest.homepage_url) return false
    const c = ctx.currentCtx()
    if (c) { ctx.sendUi(c, 'open-tab', manifest.homepage_url); return true }
    return false
  })
  ipcMain.handle('extensions:load', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: 'Selecciona la carpeta de la extensión' })
    if (canceled || !filePaths || !filePaths[0]) return null
    return extensions.loadExtensionFolder(filePaths[0])
  })
  ipcMain.handle('extensions:install-store', (_e, storeId) => extensions.installExtensionFromStore(storeId))
  ipcMain.handle('ext-storage-get', (_e, keys) => extensions.extStorageGet(keys))
  ipcMain.handle('ext-storage-set', (_e, items) => { extensions.extStorageSet(items); return true })

  ipcMain.handle('set-default-browser', async () => {
    let regOk = false
    try { regOk = await defaultBrowser.registerAsDefaultBrowser() } catch (e) { console.log('DEFAULT_REG_ERR', e && e.message) }
    let forceOk = false
    try { forceOk = await defaultBrowser.forceProtocolAssociations() } catch (e) { console.log('DEFAULT_FORCE_ERR', e && e.message) }
    let choiceOk = false
    try { choiceOk = await defaultBrowser.writeUserChoice() } catch (e) { console.log('DEFAULT_CHOICE_ERR', e && e.message) }
    try { app.setAsDefaultProtocolClient('http') } catch {}
    try { app.setAsDefaultProtocolClient('https') } catch {}
    try { shell.openExternal('ms-settings:defaultapps') } catch (e) { console.log('DEFAULT_OPEN_ERR', e && e.message) }
    console.log('DEFAULT_REGISTERED regOk=' + regOk + ' forceOk=' + forceOk + ' choiceOk=' + choiceOk)
    return regOk || forceOk
  })
  ipcMain.handle('is-default-browser', async () => {
    if (app.isDefaultProtocolClient('http')) return true
    return defaultBrowser.isHttpDefault()
  })
  ipcMain.on('save-session', (e, urls) => {
    const c = ctx.ctxFor(e)
    if (c && c.incognito) return
    store.saveSession((urls || []).map((u) => ({ url: u.url, pinned: !!u.pinned })))
  })
  ipcMain.handle('get-session', () => store.session())
  ipcMain.handle('get-url-overrides', () => (extensions.getEngine() && extensions.getEngine().getURLOverrides()) || {})

  ipcMain.on('permission-response', (e, payload) => {
    system.respondPermission(payload && payload.id, payload || {})
  })

  ipcMain.handle('save-page', (e) => { const c = ctx.ctxFor(e); if (c) downloads.savePageOf(ctx.activeWc(c)) })
  ipcMain.handle('print-wc', (e) => { const c = ctx.ctxFor(e); const w = c && ctx.activeWc(c); if (w) w.print({ silent: false, printBackground: true }) })
  ipcMain.handle('app:info', () => util.appInfo())
  ipcMain.handle('safe:allow', (_e, host) => safeBrowsing.clearHost(host))
  ipcMain.handle('reader-mode', async (e) => { const c = ctx.ctxFor(e); return reader.extractReader(ctx.activeWc(c)) })

  ipcMain.handle('taskmanager:list', async () => {
    const rows = []
    let total = 0
    let metrics = []
    try { metrics = app.getAppMetrics() || [] } catch {}
    const memByPid = new Map()
    for (const m of metrics) {
      if (m && m.pid && m.memory && typeof m.memory.workingSetSize === 'number') {
        memByPid.set(m.pid, m.memory.workingSetSize * 1024)
      }
    }
    const countedPids = new Set()
    // Las pestañas son WebContentsView (tipo 'window'): se recorren las vistas
    // registradas por ventana en lugar de filtrar por getType().
    for (const wctx of ctx.windows.values()) {
      if (!wctx || !wctx.tabs) continue
      for (const tab of wctx.tabs.values()) {
        const wc = tab && tab.wc
        if (!wc || wc.isDestroyed()) continue
        let mem = 0
        let pid = 0
        try { pid = wc.getOSProcessId() } catch {}
        if (pid) {
          mem = memByPid.get(pid) || 0
          if (mem && !countedPids.has(pid)) {
            countedPids.add(pid)
            total += mem
          }
        }
        rows.push({ id: wc.id, title: wc.getTitle() || 'Página', url: wc.getURL(), mem })
      }
    }
    return { rows, total }
  })

  ipcMain.handle('autocomplete:query', (_e, q) => search.autocompleteQuery(q))
  ipcMain.handle('bookmarks:list', () => store.listBookmarks())
  ipcMain.handle('bookmarks:add', (_e, b) => store.addBookmark(b))
  ipcMain.handle('bookmarks:remove', (_e, id) => store.removeBookmark(id))
  ipcMain.handle('bookmarks:update', (_e, id, patch) => store.updateBookmark(id, patch))
  ipcMain.handle('bookmarks:reorder', (_e, ids) => store.reorderBookmarks(ids))
  ipcMain.handle('readinglist:list', () => store.listReadingList())
  ipcMain.handle('readinglist:add', (_e, item) => store.addReadingItem(item))
  ipcMain.handle('readinglist:remove', (_e, id) => store.removeReadingItem(id))
  ipcMain.handle('readinglist:open', (_e, id) => {
    const item = store.listReadingList().find((i) => i.id === id)
    if (!item) return null
    return reader.put({ title: item.title, url: item.url, text: item.text })
  })
  ipcMain.handle('groups:get', () => store.tabGroups())
  ipcMain.handle('groups:set', (_e, g) => { store.setTabGroups(g); return true })
  ipcMain.handle('workspaces:list', () => store.listWorkspaces())
  ipcMain.handle('workspaces:save', (_e, name, tabs) => store.saveWorkspace(name, tabs))
  ipcMain.handle('workspaces:open', (_e, name) => {
    const ws = store.listWorkspaces().find((w) => w.name === name)
    if (!ws) return false
    const c = ctx.currentCtx()
    ws.tabs.forEach((t) => { if (c && t.url) ctx.sendUi(c, 'open-tab-bg', t.url) })
    return true
  })
  ipcMain.handle('workspaces:delete', (_e, name) => { store.removeWorkspace(name); return true })
  ipcMain.handle('bookmarks:export', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: 'marcadores.html',
      filters: [{ name: 'HTML', extensions: ['html'] }],
    })
    if (canceled || !filePath) return false
    const rows = store
      .listBookmarks()
      .map((b) => `    <DT><A HREF="${util.escapeHtml(b.url)}">${util.escapeHtml(b.title || b.url)}</A>` + (b.folder ? ` [${util.escapeHtml(b.folder)}]` : '') + `</DT>`)
      .join('\n')
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Marcadores</TITLE>\n<H1>Marcadores</H1>\n<DL><p>\n${rows}\n</DL><p>\n`
    fs.writeFileSync(filePath, html, 'utf8')
    return true
  })
  ipcMain.handle('bookmarks:import-chrome', () => {
    const base = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Google', 'Chrome', 'User Data', 'Default', 'Bookmarks')
    if (!fs.existsSync(base)) return { error: 'No se encontró el perfil de Chrome' }
    try {
      const data = JSON.parse(fs.readFileSync(base, 'utf8'))
      let count = 0
      const walk = (node, folder) => {
        if (!node || !node.children) return
        for (const c of node.children) {
          if (c.type === 'folder') walk(c, folder ? folder + ' / ' + c.name : (c.name || ''))
          else if (c.type === 'url' && /^https?:/.test(c.url || '')) {
            store.addBookmark({ url: c.url, title: c.name || c.url, folder: folder || '' })
            count++
          }
        }
      }
      const roots = (data && data.roots) || {}
      for (const r of Object.values(roots)) walk(r, '')
      return { count }
    } catch (e) {
      return { error: 'No se pudo leer el archivo: ' + (e && e.message) }
    }
  })
  ipcMain.handle('import-chrome-full', () => {
    const base = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Google', 'Chrome', 'User Data', 'Default')
    const out = { history: 0, passwords: 0, error: null }
    const histFile = path.join(base, 'History')
    if (fs.existsSync(histFile)) {
      try {
        const ctx = sqlite.openDb(histFile)
        if (ctx) {
          const root = sqlite.findTable(ctx, 'urls')
          if (root) {
            const rows = sqlite.scanTable(ctx, root, 5)
            for (const r of rows) {
              const url = r[1]
              if (url && /^https?:/.test(url)) {
                store.addHistory({ url, title: r[2] || url, ts: Date.now() })
                out.history++
              }
            }
          }
        }
      } catch (e) { out.error = 'Historial: ' + (e && e.message) }
    }
    const loginFile = path.join(base, 'Login Data')
    if (fs.existsSync(loginFile)) {
      try {
        const ctx = sqlite.openDb(loginFile)
        if (ctx) {
          const root = sqlite.findTable(ctx, 'logins')
          if (root) {
            const rows = sqlite.scanTable(ctx, root, 7)
            for (const r of rows) {
              const origin = r[0]
              const user = r[3] || ''
              const pass = r[5] || ''
              if (origin && /^https?:/.test(origin) && pass) {
                store.addPassword({ origin, username: user, password: pass })
                out.passwords++
              }
            }
          }
        }
      } catch (e) { out.error = 'Contraseñas: ' + (e && e.message) }
    }
    return out
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
  ipcMain.handle('downloads:clear', () => { store.clearDownloads(); util.broadcastDownloads() })
  ipcMain.handle('downloads:remove', (_e, id) => { store.removeDownload(id); util.broadcastDownloads(); return true })
  ipcMain.handle('downloads:open', (_e, p) => { if (p) { try { shell.openPath(p) } catch {} } return true })
  ipcMain.handle('downloads:show', (_e, p) => { if (p) { try { shell.showItemInFolder(p) } catch {} } return true })
  ipcMain.handle('downloads:folder', (_e, p) => { if (p) { try { shell.openPath(path.dirname(p)) } catch {} } return true })
  ipcMain.handle('downloads:cancel', (_e, id) => downloads.cancelDownload(id))
  ipcMain.handle('downloads:preview', (_e, p) => {
    if (!p || typeof p !== 'string') return null
    const mime = (ext) => ({ jpg: 'jpeg', jpeg: 'jpeg', png: 'png', gif: 'gif', webp: 'webp', bmp: 'bmp', ico: 'x-icon', svg: 'svg+xml' }[ext] || null)
    try {
      const ext = path.extname(p).slice(1).toLowerCase()
      const t = mime(ext)
      if (!t) return null
      const size = fs.statSync(p).size
      if (size > 3 * 1024 * 1024) return null
      const buf = fs.readFileSync(p)
      return 'data:image/' + t + ';base64,' + buf.toString('base64')
    } catch {
      return null
    }
  })
  ipcMain.handle('settings:get', () => util.settingsForUi())
  ipcMain.handle('settings:defaults', () => store.settingsDefaults())
  ipcMain.handle('permissions:list', () => system.listSitePermissions())
  ipcMain.handle('permissions:set', (e, origin, permission, state) => {
    if (state === 'once') {
      const c = ctx.ctxFor(e)
      const wc = c && c.activeWcId ? webContents.fromId(c.activeWcId) : null
      if (wc) system.grantOnce(wc.id, origin, permission)
      return true
    }
    system.setSitePermission(origin, permission, state)
    return true
  })
  ipcMain.handle('permissions:clear', (_e, origin) => { system.clearSitePermissions(origin); return true })
  ipcMain.handle('permissions:clear-all', () => { system.clearAllSitePermissions(); return true })
  ipcMain.handle('settings:set', (_e, patch) => {
    if (patch && typeof patch.aiApiKey === 'string' && patch.aiApiKey) {
      patch = { ...patch, aiApiKey: store.encryptSecret(patch.aiApiKey) }
    }
    store.setSettings(patch)
    if (patch.forcePageTheme !== undefined) applyForcedTheme()
    if (patch.downloadPath !== undefined) {
      try { session.defaultSession.setDownloadPath(patch.downloadPath || app.getPath('downloads')) } catch {}
    }
    util.broadcastSettings()
    overlayMod.applySettings()
    if (patch && patch.overlayHotkey !== undefined && !overlayMod.isValidAccelerator(patch.overlayHotkey)) {
      broadcastToast('Atajo de teclado no válido: ' + patch.overlayHotkey + ' (no se guardó)', 'info')
    }
  })
  ipcMain.handle('search:engines', () => ({ engines: store.engines(), defaultId: store.settings().defaultSearchEngine }))
  ipcMain.handle('search:url', (_e, q) => store.searchUrl(q))
  ipcMain.handle('search:suggest', (_e, q) => (store.settings().searchSuggestionsEnabled === false ? [] : search.searchSuggestions(q)))
  ipcMain.handle('search:recent', (_e, q) => {
    const term = String(q || '').toLowerCase()
    return store.recentSearches().filter((s) => !term || s.toLowerCase().indexOf(term) !== -1)
  })
  ipcMain.on('search:record', (_e, q) => store.addSearch(q))
  ipcMain.handle('ai:chat', async (e, messages) => {
    const c = ctx.ctxFor(e)
    const augmented = await augmentAiMessages(messages, c)
    return ai.chat(augmented)
  })
  ipcMain.handle('ai:search', (_e, query) => ai.searchWeb(String(query || '').slice(0, 300)))
  ipcMain.handle('ai:page-context', async (e) => {
    const c = ctx.ctxFor(e)
    const w = c && ctx.activeWc(c)
    if (!w || w.isDestroyed()) return { title: '', url: '', text: '' }
    let url = ''
    try { url = w.getURL() } catch {}
    if (!url || !/^https?:/.test(url)) return { title: '', url: '', text: '' }
    let title = ''
    try { title = w.getTitle() || '' } catch {}
    let text = ''
    try {
      const id = await reader.extractReader(w)
      const content = id ? reader.getReader(id) : null
      text = (content && content.text) || ''
    } catch {}
    return { title, url, text }
  })
  ipcMain.handle('translate:text', (_e, text, tl) => translate.translateText(String(text || ''), tl))
  ipcMain.handle('adblock:stats', () => adblock.stats())
  ipcMain.handle('adblock:refresh', () => { adblock.refresh(); return true })
  ipcMain.handle('adblock:recent', () => adblock.recentLog())
  ipcMain.handle('adblock:cosmetic', (_e, host) => adblock.cosmeticCss(host))
  ipcMain.handle('yt-ad-script', () => require('./yt-script'))
  ipcMain.handle('shields:get', (_e, origin) => {
    let o = origin
    try { o = new URL(origin).origin } catch {}
    const g = guardState(o)
    const blocked = adblock.stats().blocked[o] || { ads: 0, scripts: 0, trackers: 0 }
    return {
      origin: o,
      blockAds: g.blockAds,
      blockTrackers: g.blockTrackers,
      blockScripts: g.blockScripts,
      blockCookies: g.blockThirdPartyCookies,
      ads: blocked.ads || 0,
      scripts: blocked.scripts || 0,
      trackers: blocked.trackers || 0,
    }
  })
  ipcMain.handle('shields:set', (_e, payload) => {
    const s = store.settings()
    s.siteShields = s.siteShields || {}
    s.siteShields[payload.origin] = Object.assign({}, s.siteShields[payload.origin], payload.patch)
    store.setSettings({ siteShields: s.siteShields })
    return true
  })
  ipcMain.on('clipboard:write', (_e, text) => {
    if (typeof text === 'string' && text) {
      try { clipboard.writeText(text) } catch {}
    }
  })
  ipcMain.handle('cert:status', (_e, origin) => {
    let o = ''
    try { o = new URL(origin).origin } catch { o = origin }
    const bad = insecureOrigins.get(o)
    return { secure: !!o && o.startsWith('https://') && !bad, error: bad ? bad.code : null }
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
  ipcMain.handle('site:install', (_e, url, title) => {
    if (!/^https?:/.test(url || '')) return false
    try {
      const desktop = app.getPath('desktop')
      const safe = String(title || 'Sitio').replace(/[\\/:*?"<>|]/g, '').slice(0, 60)
      fs.writeFileSync(path.join(desktop, safe + '.url'), '[InternetShortcut]\r\nURL=' + url + '\r\nIconFile=' + process.execPath + '\r\nIconIndex=0\r\n')
      return true
    } catch {
      return false
    }
  })
  ipcMain.handle('data:clear', async (_e, what) => {
    const ses = session.defaultSession
    if (what.cache) await ses.clearCache()
    if (what.cookies || what.local) await ses.clearStorageData()
    if (what.history) store.clearHistory()
    if (what.downloads) { store.clearDownloads(); util.broadcastDownloads() }
    return true
  })
  let oskProc = null
  let oskBlurTimer = null
  const oskMock = process.env.NIXER_OSK_MOCK === '1'

  function oskStatus(open) {
    for (const wc of webContents.getAllWebContents()) {
      if (wc.getType() === 'window') wc.send('osk-status', open)
    }
  }

  function findProcessPid(name) {
    return new Promise((resolve) => {
      try {
        const tl = spawn('tasklist', ['/FI', 'IMAGENAME eq ' + name, '/FO', 'CSV', '/NH'], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
        let out = ''
        tl.stdout && tl.stdout.on('data', (d) => { out += String(d) })
        tl.on('close', () => {
          const m = /"([^"]+)".*?"(\d+)"/.exec(String(out))
          resolve(m ? Number(m[2]) : null)
        })
        tl.on('error', () => resolve(null))
      } catch { resolve(null) }
    })
  }

  function isProcessRunning(name) {
    return findProcessPid(name).then((pid) => pid !== null)
  }

  function isElevated() {
    return new Promise((resolve) => {
      try {
        const net = spawn('net', ['session'], { stdio: 'ignore', windowsHide: true })
        net.on('close', (code) => resolve(code === 0))
        net.on('error', () => resolve(false))
      } catch { resolve(false) }
    })
  }

  function killProcess(name) {
    return new Promise((resolve) => {
      try {
        const tk = spawn('taskkill', ['/IM', name, '/F'], { stdio: 'ignore', windowsHide: true })
        tk.on('close', () => resolve())
        tk.on('error', () => resolve())
      } catch { resolve() }
    })
  }

  async function ensureNoKeyboardZombies() {
    if (oskMock) return
    for (const name of ['osk.exe', 'TabTip.exe']) {
      if (await isProcessRunning(name)) {
        await killProcess(name)
        console.log('[TV] ' + name + ' zombi eliminado')
      }
    }
  }

  function bringKeyboardToFront(pid) {
    if (oskMock || !pid) return
    try {
      spawn('powershell', ['-NoProfile', '-Command', '(New-Object -ComObject WScript.Shell).AppActivate(' + pid + ')'], { stdio: 'ignore', windowsHide: true })
    } catch {}
    console.log('[TV] teclado al frente (pid=' + pid + ')')
  }

  let oskStarting = null
  let oskActive = false
  let oskExe = null

  function spawnKeyboard() {
    const sys = process.env.SystemRoot || 'C:\\Windows'
    const candidates = [
      { name: 'TabTip', path: path.join(sys, 'System32', 'TabTip.exe') },
      { name: 'osk', path: path.join(sys, 'System32', 'osk.exe') },
    ]
    let exe = null
    for (const c of candidates) {
      if (oskMock || fs.existsSync(c.path)) { exe = c; break }
    }
    if (!exe) return Promise.resolve({ ok: false, reason: 'missing' })
    if (oskActive) return Promise.resolve({ ok: true })
    if (oskStarting) return oskStarting
    oskStarting = (async () => {
      try {
        await ensureNoKeyboardZombies()
        if (oskMock) {
          oskStatus(true)
          console.log('[TV] teclado virtual (mock)')
          return { ok: true }
        }
        const elevated = await isElevated()
        let launched
        if (elevated) {
          console.log('[TV] proceso elevado: lanzando con runas /trustlevel:0x20000')
          launched = spawn('runas', ['/trustlevel:0x20000', exe.path], { stdio: 'ignore', windowsHide: true })
        } else {
          launched = spawn(exe.path, [], { stdio: 'ignore', windowsHide: false })
        }
        oskProc = launched
        const viaRunas = elevated
        launched.on('error', (err) => {
          console.log('[TV] error al lanzar teclado:', err && err.message)
          oskProc = null
        })
        launched.on('exit', (code, signal) => {
          console.log('[TV] proceso lanzador salió: code=' + code + ' signal=' + signal)
          oskProc = null
          if (!viaRunas) oskActive = false
        })
        oskStatus(true)
        oskActive = true
        console.log('[TV] teclado virtual abierto:', exe.name, elevated ? '(via runas)' : '')
        const confirmAlive = (pid) => {
          oskExe = exe.name
          console.log('[TV] teclado vivo (pid=' + pid + ')')
          bringKeyboardToFront(pid)
        }
        setTimeout(async () => {
          const pid = await findProcessPid(exe.name)
          if (pid) { confirmAlive(pid); return }
          setTimeout(async () => {
            const pid2 = await findProcessPid(exe.name)
            if (pid2) { confirmAlive(pid2); return }
            oskActive = false
            console.log('[TV] el teclado no aparece tras el lanzamiento')
            broadcastToast('El teclado en pantalla no pudo iniciarse', 'info')
          }, 1500)
        }, 800)
        return { ok: true }
      } catch (err) {
        console.log('[TV] excepción al lanzar teclado:', err && err.message)
        return { ok: false, reason: 'spawn' }
      } finally {
        oskStarting = null
      }
    })()
    return oskStarting
  }

  function closeOsk() {
    clearTimeout(oskBlurTimer)
    oskActive = false
    oskProc = null
    if (!oskMock && oskExe) {
      killProcess(oskExe)
      oskExe = null
    }
    oskStatus(false)
  }

  ipcMain.handle('osk:open', () => {
    if (store.settings().tvKeyboard === 'system') return spawnKeyboard()
    oskActive = true
    oskStatus(true)
    console.log('[TV] teclado integrado activado')
    return Promise.resolve({ ok: true })
  })
  ipcMain.on('osk:close', () => closeOsk())
  ipcMain.on('tv:input-focus', async () => {
    console.log('[TV] focus en campo editable, tvMode=', store.settings().tvMode)
    if (store.settings().tvMode !== true && store.settings().gameOverlay !== true) return
    clearTimeout(oskBlurTimer)
    if (store.settings().tvKeyboard === 'system') {
      const r = await spawnKeyboard()
      if (!r.ok) broadcastToast('No se pudo abrir el teclado virtual: no hay TabTip.exe ni osk.exe', 'info')
      return
    }
    oskActive = true
    oskStatus(true)
    console.log('[TV] teclado integrado activado')
  })
  ipcMain.on('tv:input-blur', () => {
    clearTimeout(oskBlurTimer)
    oskBlurTimer = setTimeout(() => closeOsk(), 2500)
  })
  ipcMain.on('ui-pointer', (e, data) => {
    const c = ctx.ctxFor(e)
    const t = ctx.ui(c)
    if (!t || t.isDestroyed() || !data) return
    const x = Math.round(data.x || 0)
    const y = Math.round(data.y || 0)
    try {
      if (data.type === 'down') t.sendInputEvent({ type: 'mouseDown', x, y, button: data.button || 'left', clickCount: data.count || 1 })
      else if (data.type === 'up') t.sendInputEvent({ type: 'mouseUp', x, y, button: data.button || 'left', clickCount: data.count || 1 })
      else if (data.type === 'move') t.sendInputEvent({ type: 'mouseMove', x, y, movementX: 0, movementY: 0, button: data.button || 'left', buttons: data.buttons || 0 })
      else if (data.type === 'wheel') t.sendInputEvent({ type: 'mouseWheel', x, y, deltaX: Math.round(data.deltaX || 0), deltaY: Math.round(data.deltaY || 0) })
    } catch {}
  })
  ipcMain.on('overlay:toggle', () => overlayMod.toggleOverlay())
}

const { buildMenu, showContentMenu } = menus.createMenus({
  createWindow,
  extractReader: reader.extractReader,
  savePageOf: downloads.savePageOf,
  saveAsUrl: downloads.saveAsUrl,
  captureScreenshot: util.captureScreenshot,
  togglePip: util.togglePip,
  ai,
  readerGet: reader.getReader,
  readerPut: reader.put,
  translatePage: translate.translatePage,
  translateText: translate.translateText,
})
tabGuards.setShowContentMenu(showContentMenu)

app.on('web-contents-created', (_e, wc) => {
  const type = wc.getType()
  if (type === 'window') {
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
  if (type !== 'webview' && type !== 'browserView') return
  if (type === 'webview') extensions.registerTab(wc)
  tabGuards.attachTabGuards(wc)
  wc.on('dom-ready', () => {
    let host = ''
    try { host = new URL(wc.getURL()).hostname } catch {}
    if (host !== 'chromewebstore.google.com') return
    try {
      wc.executeJavaScript(`(() => {
        try {
          const brands = [{ brand: 'Chromium', version: '${CHROME_MAJOR}' }, { brand: 'Google Chrome', version: '${CHROME_MAJOR}' }, { brand: 'Not=A?Brand', version: '99' }]
          const fake = {
            brands,
            mobile: false,
            platform: 'Windows',
            getHighEntropyValues: () => Promise.resolve({ brands, mobile: false, platform: 'Windows', architecture: 'x86', bitness: '64', platformVersion: '10.0.0', uaFullVersion: '${CHROME_MAJOR}.0.0.0' }),
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
  detectAbnormalClose()
  const ap = store.settings().autoplayPolicy
  try { session.defaultSession.setAutoplayPolicy(ap) } catch {}
  try { session.fromPartition(PRIVATE_PARTITION).setAutoplayPolicy(ap) } catch {}
  system.syncLoginItem()
  const cleanUa = session.defaultSession
    .getUserAgent()
    .replace(/navegador\/[\d.]+/i, '')
    .replace(/NixerBrowser\/[\d.]+/i, '')
    .replace(/Electron\/[\d.]+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
  const STORE_HINTS = {
    'sec-ch-ua': `"Chromium";v="${CHROME_MAJOR}", "Google Chrome";v="${CHROME_MAJOR}", "Not=A?Brand";v="99"`,
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'user-agent': cleanUa,
  }
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['*://chromewebstore.google.com/*'] }, (details, cb) => {
    cb({ requestHeaders: Object.assign({}, details.requestHeaders, STORE_HINTS) })
  })
  session.fromPartition(PRIVATE_PARTITION).webRequest.onBeforeSendHeaders({ urls: ['*://chromewebstore.google.com/*'] }, (details, cb) => {
    cb({ requestHeaders: Object.assign({}, details.requestHeaders, STORE_HINTS) })
  })
  const dl = store.settings().downloadPath
  if (dl) {
    try { session.defaultSession.setDownloadPath(dl) } catch {}
  }
  downloads.initDownloads()
  adblock.init(session.defaultSession, guardState)
  adblock.init(session.fromPartition(PRIVATE_PARTITION), guardState)
  system.initPermissions(session.defaultSession)
  system.initPermissions(session.fromPartition(PRIVATE_PARTITION))
  adblock.refresh()
  buildMenu()
  registerIpc()
  extensions.setupExtensions(createWindow)
  nixer.install([session.defaultSession, session.fromPartition(PRIVATE_PARTITION)])
  extensions.rehydrateExtensions()
  profiles.init()
  // Puerta de entrada: sin perfil activo se abre la ventana de bienvenida/registro
  // (standalone); tras crearla/iniciar sesión se abre el navegador.
  // En entornos de test/CI se auto-crea un perfil por defecto para no bloquear.
  if (profiles.hasActive()) {
    createWindow({ initial: true })
  } else if (process.env.SMOKE === '1' || (process.env.NIXER_USER_DATA && process.env.NIXER_SKIP_AUTOCREATE !== '1')) {
    profiles.ensureDefault()
    createWindow({ initial: true })
  } else if (process.env.SMOKE !== '1') {
    openOnboarding()
  } else {
    createWindow({ initial: true })
  }
  overlayMod.init({ onToast: broadcastToast, getSettings: () => store.settings() })
  overlayMod.applySettings()
  if (process.env.SMOKE === '1') runSmoke()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  setInterval(util.gcHiddenWebviews, 45000)
  const startUrl = process.argv.find((a) => /^https?:\/\//i.test(a) && !store.isLoopbackUrl(a))
  if (startUrl) {
    setTimeout(() => {
      const c = ctx.currentCtx()
      if (c) ctx.sendUi(c, 'open-tab', startUrl)
    }, 1500)
  }
})

async function runSmoke() {
  const http = require('http')
  const results = {}
  try {
    const wctx = ctx.windows.values().next().value
    const uiWc = wctx.win.webContents
    await new Promise((r) => setTimeout(r, 3000))

    results.tabs = await uiWc.executeJavaScript(`(async () => {
      for (let i = 0; i < 60; i++) {
        const n = document.querySelectorAll('.tab').length
        if (n > 0) return n
        await new Promise((r) => setTimeout(r, 500))
      }
      return 0
    })()`)

    const errors = []
    session.defaultSession.webRequest.onErrorOccurred({ urls: ['*://*/*'] }, (d) => errors.push(d))

    const server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'text/html')
      res.end('<html><body><h1>test</h1><img src="https://doubleclick.net/x.png"><img src="https://example.com/y.png"></body></html>')
    })
    await new Promise((r) => server.listen(0, '127.0.0.1', r))
    const port = server.address().port

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
        const tabsStill = document.querySelectorAll('.tab').length > 0
        return { dropdown: dd, tabsStill }
      })()
    `)
    results.menu.popup = popups.debugBounds().length > 0
    results.menu.dropdown = results.menu.dropdown || results.menu.popup

    await uiWc.executeJavaScript(`(async () => { document.querySelector('.menu-btn').click(); await new Promise((r) => setTimeout(r, 400)); return true })()`)

    results.navOk = await uiWc.executeJavaScript(`
      (async () => {
        const active = document.querySelector('.tab.active')
        if (!active) return 'NO_TAB'
        const id = active.dataset.id
        window.api.tabLoad(id, 'http://127.0.0.1:${port}/')
        await new Promise((r) => setTimeout(r, 3500))
        return id
      })()
    `)
    const blocked = errors.filter((e) => e.url.includes('doubleclick.net') && String(e.error).toUpperCase().includes('BLOCKED_BY_CLIENT'))
    results.adblock = blocked.length > 0
    results.anyAdErrors = errors.map((e) => e.error)
    results.pageUrl = results.navOk && results.navOk !== 'NO_TAB' ? await uiWc.executeJavaScript(`window.api.tabGetUrl('${results.navOk}')`) : ''
    results.execOk = results.navOk && results.navOk !== 'NO_TAB' ? await uiWc.executeJavaScript(`window.api.tabExecute('${results.navOk}', 'document.title')`) : null
    server.close()
  } catch (e) {
    results.error = String(e)
  }
  console.log('SMOKE_RESULT:', JSON.stringify(results))
  const ok = results.tabs > 0
    && results.autocomplete && results.autocomplete.dropdown
    && results.menu && results.menu.dropdown && results.menu.tabsStill
    && results.adblock === true
    && results.pageUrl && String(results.pageUrl).startsWith('http://127.0.0.1')
  app.exit(ok ? 0 : 1)
}

app.on('before-quit', () => {
  global.__nixerQuitting = true
  markCleanExit()
})

app.on('will-quit', () => {
  overlayMod.shutdown()
  if (store.settings().clearDataOnExit === true) {
    try { session.defaultSession.clearCache() } catch {}
    try { session.defaultSession.clearStorageData() } catch {}
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
