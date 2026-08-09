const { app, BrowserWindow, ipcMain, session, shell, dialog, webContents, screen } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { DEV_SERVER_URL, PRIVATE_PARTITION, PROFILE } = require('./constants')

app.commandLine.appendSwitch('js-flags', '--expose-gc')
app.commandLine.appendSwitch('disable-features', 'OptimizationHints,MediaRouter,TranslateUI,NetworkTimeServiceQuerying,WebRtcLocalEcho,FontSrcLocalMatching,HistoryManipulationIntervention')

app.setName('Nixer Browser')
app.setAppUserModelId('com.nixer.browser')
if (process.env.SMOKE === '1' && !process.env.NIXER_USER_DATA) {
  process.env.NIXER_USER_DATA = path.join(require('os').tmpdir(), 'nixer-smoke-profile')
}
const userDataBase = PROFILE === 'default' ? path.join(app.getPath('appData'), 'navegador') : path.join(app.getPath('appData'), 'navegador-profiles', PROFILE)
app.setPath('userData', process.env.NIXER_USER_DATA || userDataBase)

const store = require('./store')
const adblock = require('./adblock')
const ai = require('./ai')
const nixer = require('./nixer')
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
const { autoUpdater } = require('electron-updater')

let dragState = null
let dragTarget = null // { wc, winCtx, attached, entered }

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
  if (st.url) ctx.sendUi(targetCtx, 'open-tab-bg', st.url)
  const srcCtx = st.win ? ctx.windows.get(st.win) : null
  if (srcCtx && st.tabId) ctx.sendUi(srcCtx, 'close-tab-by-id', st.tabId)
  dragState = null
}

function detachFromDrag(srcCtx) {
  if (!dragState || !dragState.url) return
  const st = dragState
  const wctx = createWindow({ incognito: srcCtx ? srcCtx.incognito : false })
  if (wctx) setTimeout(() => ctx.sendUi(wctx, 'open-tab', st.url), 900)
  if (srcCtx && st.tabId) ctx.sendUi(srcCtx, 'close-tab-by-id', st.tabId)
  dragState = null
}

if (store.settings().hardwareAcceleration === false) {
  app.disableHardwareAcceleration()
}
if (store.settings().gpuRasterization === false) {
  app.commandLine.appendSwitch('disable-gpu-rasterization')
}

nixer.registerScheme()

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
      const c = ctx.windows.get(win)
      if (c) ctx.sendUi(c, 'open-tab', url)
    }
  })
}

function guardState(origin) {
  const s = store.settings()
  const shields = (s.siteShields && s.siteShields[origin]) || {}
  return {
    blockAds: shields.blockAds !== undefined ? shields.blockAds : s.blockAds,
    blockScripts: shields.blockScripts !== undefined ? shields.blockScripts : s.blockScripts,
    blockThirdPartyCookies: shields.blockCookies !== undefined ? shields.blockCookies : s.blockThirdPartyCookies,
    blockImages: s.showImages === false,
    sendDnt: s.sendDnt,
    httpsUpgrade: s.httpsUpgrade,
  }
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
  const wctx = { id: ctx.nextWindow(), win, incognito, activeWcId: null }
  ctx.registerWindow(win, wctx)

  if (app.isPackaged) win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  else win.loadURL(DEV_SERVER_URL)
  win.webContents.on('did-fail-load', (_e, code) => {
    if (!app.isPackaged && (code === -105 || code === -102)) {
      win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
    }
  })
  win.webContents.on('did-finish-load', () => {
    if (!win.isDestroyed() && process.env.SMOKE !== '1') {
      win.show()
      if (store.settings().startMinimized) win.minimize()
    }
  })

  win.on('maximize', () => { const t = ctx.ui(wctx); if (t && !t.isDestroyed()) t.send('win-maximized', true) })
  win.on('unmaximize', () => { const t = ctx.ui(wctx); if (t && !t.isDestroyed()) t.send('win-maximized', false) })
  win.on('close', (e) => {
    if (!incognito && store.settings().minimizeToTray && !system.isQuitting()) {
      e.preventDefault()
      win.hide()
      system.setupTray()
    }
  })
  win.on('closed', () => {
    ctx.unregisterWindow(win)
    if (incognito) {
      const ses = session.fromPartition(PRIVATE_PARTITION)
      try { ses.clearStorageData() } catch {}
      try { ses.clearCache() } catch {}
    }
  })
  return wctx
}

function registerIpc() {
  ipcMain.on('win-minimize', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.minimize() })
  ipcMain.on('win-toggle-maximize', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) { if (w.isMaximized()) w.unmaximize(); else w.maximize() } })
  ipcMain.on('win-close', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.close() })
  ipcMain.on('toggle-fullscreen', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.setFullScreen(!w.isFullScreen()) })
  ipcMain.on('create-window', (e, incognito, url) => {
    const c = createWindow({ incognito: !!incognito })
    if (url && c) setTimeout(() => ctx.sendUi(c, 'open-tab', url), 900)
  })
  ipcMain.handle('reader:get', (_e, id) => reader.getReader(id))

  ipcMain.handle('view-info', () => {
    return {
      preload: 'file://' + path.join(__dirname, 'view-preload.js').replace(/\\/g, '/'),
      newtab: 'nixer://newtab',
      welcome: 'nixer://welcome',
      pages: 'nixer://pages/',
    }
  })
  ipcMain.handle('window-info', (e) => {
    const c = ctx.ctxFor(e)
    return c ? { incognito: c.incognito, id: c.id } : { incognito: false, id: 0 }
  })
  ipcMain.on('drag-start', (e, info) => {
    const c = ctx.ctxFor(e)
    if (c && info) dragState = { ...info, win: c.win, winId: c.id }
  })
  ipcMain.on('drag-move', async (_e, sx, sy) => {
    if (!dragState) return
    const hit = (typeof sx === 'number' && typeof sy === 'number') ? windowAtPoint(sx, sy, dragState.win) : windowAtCursor()
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
  ipcMain.handle('get-drag-state', () => dragState ? { id: dragState.id, winId: dragState.winId } : null)
  ipcMain.handle('dock-dragged', (e) => {
    const target = ctx.ctxFor(e)
    if (!target || !dragState || dragState.winId === target.id) return false
    if (dragState.url) ctx.sendUi(target, 'open-tab-bg', dragState.url)
    const sourceCtx = dragState.win ? ctx.windows.get(dragState.win) : null
    if (sourceCtx && dragState.tabId) ctx.sendUi(sourceCtx, 'close-tab-by-id', dragState.tabId)
    dragState = null
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
    system.respondPermission(payload && payload.id, payload && payload.allow, payload && payload.remember)
  })

  ipcMain.handle('save-page', (e) => { const c = ctx.ctxFor(e); if (c) downloads.savePageOf(ctx.activeWc(c)) })
  ipcMain.handle('print-wc', (e) => { const c = ctx.ctxFor(e); const w = c && ctx.activeWc(c); if (w) w.print({ silent: false, printBackground: true }) })
  ipcMain.handle('app:info', () => util.appInfo())
  ipcMain.handle('screenshot', async (e) => { const c = ctx.ctxFor(e); const w = c && ctx.activeWc(c); return util.captureScreenshot(w) })
  ipcMain.handle('pip', (e) => { const c = ctx.ctxFor(e); util.togglePip(c && ctx.activeWc(c)); return true })
  ipcMain.handle('safe:allow', (_e, host) => safeBrowsing.clearHost(host))
  ipcMain.handle('save-as', async (e, url) => { const c = ctx.ctxFor(e); if (c) await downloads.saveAsUrl(c.win, url) })
  ipcMain.handle('reader-mode', async (e) => { const c = ctx.ctxFor(e); return reader.extractReader(ctx.activeWc(c)) })

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

  ipcMain.handle('autocomplete:query', (_e, q) => search.autocompleteQuery(q))
  ipcMain.handle('bookmarks:list', () => store.listBookmarks())
  ipcMain.handle('bookmarks:add', (_e, b) => store.addBookmark(b))
  ipcMain.handle('bookmarks:remove', (_e, id) => store.removeBookmark(id))
  ipcMain.handle('bookmarks:update', (_e, id, patch) => store.updateBookmark(id, patch))
  ipcMain.handle('bookmarks:reorder', (_e, ids) => store.reorderBookmarks(ids))
  ipcMain.handle('profiles:list', () => {
    const base = path.join(app.getPath('appData'), 'navegador-profiles')
    const names = []
    try { names.push(...fs.readdirSync(base).filter((n) => fs.statSync(path.join(base, n)).isDirectory())) } catch {}
    return { current: PROFILE, profiles: ['default', ...names.sort()] }
  })
  ipcMain.handle('profiles:switch', (_e, name) => {
    const n = String(name || '').replace(/[^a-zA-Z0-9-_]/g, '').slice(0, 40) || 'default'
    const args = process.argv.filter((a) => !a.startsWith('--profile=')).concat(['--profile=' + n])
    app.relaunch({ args })
    app.exit(0)
    return true
  })
  ipcMain.handle('profiles:delete', (_e, name) => {
    const n = String(name || '').replace(/[^a-zA-Z0-9-_]/g, '')
    if (!n || n === 'default') return false
    const dir = path.join(app.getPath('appData'), 'navegador-profiles', n)
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
    return true
  })
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
  ipcMain.handle('downloads:open', (_e, p) => { if (p) { try { shell.openPath(p) } catch {} } return true })
  ipcMain.handle('downloads:show', (_e, p) => { if (p) { try { shell.showItemInFolder(p) } catch {} } return true })
  ipcMain.handle('downloads:folder', (_e, p) => { if (p) { try { shell.openPath(path.dirname(p)) } catch {} } return true })
  ipcMain.handle('downloads:cancel', () => true)
  ipcMain.handle('settings:get', () => util.settingsForUi())
  ipcMain.handle('settings:defaults', () => store.settingsDefaults())
  ipcMain.handle('settings:set', (_e, patch) => {
    if (patch && typeof patch.aiApiKey === 'string' && patch.aiApiKey) {
      patch = { ...patch, aiApiKey: store.encryptSecret(patch.aiApiKey) }
    }
    store.setSettings(patch)
    if (patch.downloadPath !== undefined) {
      try { session.defaultSession.setDownloadPath(patch.downloadPath || app.getPath('downloads')) } catch {}
    }
    util.broadcastSettings()
  })
  ipcMain.handle('search:engines', () => ({ engines: store.engines(), defaultId: store.settings().defaultSearchEngine }))
  ipcMain.handle('search:url', (_e, q) => store.searchUrl(q))
  ipcMain.handle('search:suggest', (_e, q) => (store.settings().searchSuggestionsEnabled === false ? [] : search.searchSuggestions(q)))
  ipcMain.handle('search:recent', (_e, q) => {
    const term = String(q || '').toLowerCase()
    return store.recentSearches().filter((s) => !term || s.toLowerCase().indexOf(term) !== -1)
  })
  ipcMain.on('search:record', (_e, q) => store.addSearch(q))
  ipcMain.handle('ai:chat', (_e, messages) => ai.chat(messages || []))
  ipcMain.handle('translate:text', (_e, text, tl) => translate.translateText(String(text || ''), tl))
  ipcMain.handle('adblock:stats', () => adblock.stats())
  ipcMain.handle('adblock:refresh', () => { adblock.refresh(); return true })
  ipcMain.handle('adblock:recent', () => adblock.recentLog())
  ipcMain.handle('shields:get', (_e, origin) => {
    const s = store.settings()
    const shields = (s.siteShields && s.siteShields[origin]) || {}
    const blocked = adblock.stats().blocked[origin] || { ads: 0, scripts: 0, trackers: 0 }
    return {
      origin,
      blockAds: shields.blockAds !== undefined ? shields.blockAds : s.blockAds,
      blockScripts: shields.blockScripts !== undefined ? shields.blockScripts : s.blockScripts,
      blockCookies: s.blockThirdPartyCookies,
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
  extensions.registerTab(wc)
  wc.on('context-menu', (_ev, params) => {
    const c = ctx.ctxForWc(wc)
    if (c) showContentMenu(c, wc, params)
  })
  safeBrowsing.attachWebviewGuards(wc)
  pageStyle.attach(wc)
  wc.on('update-target-url', (_e, url) => {
    const c = ctx.ctxForWc(wc)
    if (c) ctx.sendUi(c, 'status-url', url || '')
  })
  wc.setWindowOpenHandler(({ url }) => {
    if (store.settings().blockPopups) return { action: 'deny' }
    const c = ctx.ctxForWc(wc)
    if (c && url) ctx.sendUi(c, 'open-tab', url)
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
  const ap = store.settings().autoplayPolicy
  try { session.defaultSession.setAutoplayPolicy(ap) } catch {}
  try { session.fromPartition(PRIVATE_PARTITION).setAutoplayPolicy(ap) } catch {}
  system.syncLoginItem()
  for (const ses of [session.defaultSession, session.fromPartition(PRIVATE_PARTITION)]) {
    ses.webRequest.onBeforeSendHeaders({ urls: ['*://chromewebstore.google.com/*'] }, (details, cb) => {
      cb({ requestHeaders: Object.assign({}, details.requestHeaders, CHROME_HINTS) })
    })
  }
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
  createWindow()
  if (process.env.SMOKE === '1') runSmoke()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
  setInterval(util.gcHiddenWebviews, 45000)
  try {
    if (app.isPackaged) autoUpdater.checkForUpdatesAndNotify().catch(() => {})
  } catch {}
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

app.on('will-quit', () => {
  if (store.settings().clearDataOnExit) {
    try { session.defaultSession.clearCache() } catch {}
    try { session.defaultSession.clearStorageData() } catch {}
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
