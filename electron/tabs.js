const { webContents, WebContentsView, dialog } = require('electron')
const ctx = require('./ctx')
const tabGuards = require('./tab-guards')
const extensions = require('./extensions')
const popups = require('./popups')
const { CHROME_HEIGHT } = require('./constants')

function forwardEvent(tab, type, data) {
  const wctx = tab.winCtx
  const ui = wctx && ctx.ui(wctx)
  if (ui && !ui.isDestroyed()) {
    try { ui.send('tab-event', Object.assign({ id: tab.id, type }, data || {})) } catch {}
  }
}

function setupTabEvents(tab) {
  const wc = tab.wc
  wc.on('dom-ready', () => forwardEvent(tab, 'dom-ready'))
  wc.on('did-navigate', (_e, url) => forwardEvent(tab, 'did-navigate', { url }))
  wc.on('did-navigate-in-page', (_e, url, isMainFrame) => forwardEvent(tab, 'did-navigate-in-page', { url, isMainFrame }))
  wc.on('did-fail-load', (_e, code, desc, url, isMainFrame) => forwardEvent(tab, 'did-fail-load', { code, desc, url, isMainFrame }))
  wc.on('page-title-updated', (_e, title) => forwardEvent(tab, 'title', { title }))
  wc.on('page-favicon-updated', (_e, favicons) => forwardEvent(tab, 'favicon', { favicons }))
  wc.on('media-started-playing', () => forwardEvent(tab, 'media-started'))
  wc.on('media-paused', () => forwardEvent(tab, 'media-paused'))
  wc.on('did-start-loading', () => forwardEvent(tab, 'loading', { loading: true }))
  wc.on('did-stop-loading', () => forwardEvent(tab, 'loading', { loading: false }))
  wc.on('found-in-page', (_e, result) => forwardEvent(tab, 'found-in-page', { result }))
  wc.on('render-process-gone', () => forwardEvent(tab, 'render-gone'))
  wc.on('update-target-url', (_e, url) => forwardEvent(tab, 'target-url', { url }))
}

function createTab(wctx, opts) {
  const id = String(opts.id)
  if (wctx.tabs.has(id)) return { wcId: wctx.tabs.get(id).wc.id, existing: true }
  const view = new WebContentsView({
    webPreferences: {
      partition: opts.partition || undefined,
      preload: opts.preload || undefined,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      spellcheck: false,
      backgroundColor: '#141414',
    },
  })
  const wc = view.webContents
  const tab = { id, wc, view, winCtx: wctx, active: false }
  wctx.tabs.set(id, tab)
  try { wctx.win.contentView.addChildView(view) } catch {}
  setupTabEvents(tab)
  try {
    wc.on('before-input-event', (_e, input) => {
      if (input.type === 'mouseDown' || input.type === 'mouseWheel') {
        try { if (wctx.win && !wctx.win.isDestroyed()) popups.hideAllForWindow(wctx) } catch {}
      }
    })
  } catch {}
  try { tabGuards.attachTabGuards(wc) } catch {}
  try { extensions.registerTabInWindow(wc, wctx.win) } catch {}
  const src = opts.src || ''
  if (src && /^[a-z]+:/.test(src)) {
    try { wc.loadURL(src).catch(() => {}) } catch {}
  } else if (src) {
    try { wc.loadURL('nixer://newtab').catch(() => {}) } catch {}
  }
  return { wcId: wc.id }
}

function getTab(wctx, id) {
  return wctx.tabs.get(String(id)) || null
}

function setLayout(wctx, visible) {
  const list = Array.isArray(visible) ? visible : []
  wctx.lastLayout = list
  // Franja superior reservada al chrome DOM: la página nunca puede superponerse
  // a la barra de herramientas (los WebContentsView se componen encima del DOM).
  // Y >= CHROME_HEIGHT y altura = altoDeVentana - Y (sin desbordar por abajo).
  let winH = 0
  try { winH = wctx.win && !wctx.win.isDestroyed() ? wctx.win.getContentSize()[1] : 0 } catch {}
  for (const tab of wctx.tabs.values()) {
    const entry = list.find((v) => String(v.id) === tab.id)
    if (entry && entry.rect) {
      const x = Math.max(0, Math.round(entry.rect.x))
      const y = Math.max(CHROME_HEIGHT, Math.round(entry.rect.y))
      const width = Math.max(50, Math.round(entry.rect.width))
      const maxH = winH > y ? winH - y : Math.max(50, Math.round(entry.rect.height))
      const height = Math.max(50, Math.min(Math.round(entry.rect.height), maxH))
      let wasVisible = false
      try { wasVisible = tab.view.getVisible() } catch {}
      try {
        tab.view.setBounds({ x, y, width, height })
      } catch {}
      try { tab.view.setVisible(true) } catch {}
      // Al pasar de oculta a visible, Windows puede dejar la vista en blanco;
      // un nudge de bounds fuerza el repintado.
      if (!wasVisible) {
        setTimeout(() => {
          try {
            const b = tab.view.getBounds()
            tab.view.setBounds({ x: b.x, y: b.y, width: b.width + 1, height: b.height })
            tab.view.setBounds({ x: b.x, y: b.y, width: b.width, height: b.height })
          } catch {}
        }, 0)
      }
    } else {
      try { tab.view.setVisible(false) } catch {}
    }
  }
}

function reapplyLayout(wctx) {
  setLayout(wctx, wctx.lastLayout || [])
}

function loadTab(wctx, id, url) {
  const t = getTab(wctx, id)
  if (t && url) { try { t.wc.loadURL(url).catch(() => {}) } catch {} }
}

function reloadTab(wctx, id, noCache) {
  const t = getTab(wctx, id)
  if (!t || t.wc.isDestroyed()) return
  try { if (noCache) t.wc.reloadIgnoringCache(); else t.wc.reload() } catch {}
}

function stopTab(wctx, id) {
  const t = getTab(wctx, id)
  if (t) { try { t.wc.stop() } catch {} }
}

function backTab(wctx, id) {
  const t = getTab(wctx, id)
  if (t && t.wc.navigationHistory.canGoBack()) { try { t.wc.navigationHistory.goBack() } catch {} }
}

function forwardTab(wctx, id) {
  const t = getTab(wctx, id)
  if (t && t.wc.navigationHistory.canGoForward()) { try { t.wc.navigationHistory.goForward() } catch {} }
}

function navState(wctx, id) {
  const t = getTab(wctx, id)
  if (!t || t.wc.isDestroyed()) return { canGoBack: false, canGoForward: false, isLoading: false }
  try {
    return {
      canGoBack: t.wc.navigationHistory.canGoBack(),
      canGoForward: t.wc.navigationHistory.canGoForward(),
      isLoading: t.wc.isLoading(),
    }
  } catch {
    return { canGoBack: false, canGoForward: false, isLoading: false }
  }
}

function zoomGet(wctx, id) {
  const t = getTab(wctx, id)
  if (!t) return 1
  try { return t.wc.getZoomFactor() } catch { return 1 }
}

function zoomSet(wctx, id, factor) {
  const t = getTab(wctx, id)
  if (t) { try { t.wc.setZoomFactor(factor) } catch {} }
}

function muteTab(wctx, id, muted) {
  const t = getTab(wctx, id)
  if (t) { try { t.wc.setAudioMuted(!!muted) } catch {} }
}

function findTab(wctx, id, text, opts) {
  const t = getTab(wctx, id)
  if (t && text) { try { t.wc.findInPage(text, opts || {}) } catch {} }
}

function stopFindTab(wctx, id, action) {
  const t = getTab(wctx, id)
  if (t) { try { t.wc.stopFindInPage(action || 'clearSelection') } catch {} }
}

function inputTab(wctx, id, ev) {
  const t = getTab(wctx, id)
  if (t && ev) { try { t.wc.sendInputEvent(ev) } catch {} }
}

function executeTab(wctx, id, code) {
  const t = getTab(wctx, id)
  if (!t) return Promise.resolve(null)
  return t.wc.executeJavaScript(code).catch(() => null)
}

function getUrl(wctx, id) {
  const t = getTab(wctx, id)
  return t ? t.wc.getURL() : ''
}

function getTitle(wctx, id) {
  const t = getTab(wctx, id)
  return t ? t.wc.getTitle() : ''
}

function getWcId(wctx, id) {
  const t = getTab(wctx, id)
  return t ? t.wc.id : 0
}

function finalizeClosed(wctx, t) {
  if (!wctx.tabs.has(t.id)) return
  wctx.tabs.delete(t.id)
  try {
    if (wctx.win && !wctx.win.isDestroyed()) wctx.win.contentView.removeChildView(t.view)
  } catch {}
  let ui = null
  try { ui = (wctx.win && !wctx.win.isDestroyed()) ? wctx.win.webContents : null } catch {}
  if (ui && !ui.isDestroyed()) {
    try { ui.send('tab-event', { id: t.id, type: 'tab-closed' }) } catch {}
  }
  try {
    if (wctx.win && !wctx.win.isDestroyed()) reapplyLayout(wctx)
  } catch {}
}

// Override de test para el diálogo de confirmación de cierre.
let closeConfirmOverride = null
function setCloseConfirmOverride(fn) { closeConfirmOverride = fn }

function closeTab(wctx, id) {
  const t = wctx.tabs.get(String(id))
  if (!t || t.wc.isDestroyed()) return
  const onClosed = () => finalizeClosed(wctx, t)
  t.wc.once('destroyed', onClosed)
  t.wc.once('will-prevent-unload', async (e) => {
    t.wc.removeListener('destroyed', onClosed)
    let response = 0
    if (typeof closeConfirmOverride === 'function') {
      try { response = (await closeConfirmOverride(t)) || 0 } catch {}
    } else {
      const win = wctx.win && !wctx.win.isDestroyed() ? wctx.win : null
      try {
        const r = await dialog.showMessageBox(win, {
          type: 'warning',
          title: '¿Seguro que quieres cerrar este sitio web?',
          message: '¿Seguro que quieres cerrar este sitio web?',
          detail: 'La página está intentando evitar que cierres (posiblemente hay cambios sin guardar).',
          buttons: ['Cancelar', 'Salir de todos modos'],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        })
        response = r && r.response
      } catch {}
    }
    if (response === 1) {
      e.preventDefault()
      t.wc.once('destroyed', () => finalizeClosed(wctx, t))
      setTimeout(() => {
        if (wctx.tabs.has(t.id) && !t.wc.isDestroyed()) {
          try { t.wc.close({ waitForBeforeUnload: false }) } catch {}
        }
      }, 50)
    }
  })
  try { t.wc.close({ waitForBeforeUnload: true }) } catch { finalizeClosed(wctx, t) }
}

function forceCloseTab(wctx, id) {
  const t = wctx.tabs.get(String(id))
  if (!t || t.wc.isDestroyed()) return
  t.wc.once('destroyed', () => finalizeClosed(wctx, t))
  try { t.wc.close({ waitForBeforeUnload: false }) } catch { finalizeClosed(wctx, t) }
}

function closeAll(wctx) {
  for (const id of Array.from(wctx.tabs.keys())) closeTab(wctx, id)
}

module.exports = {
  createTab,
  setLayout,
  reapplyLayout,
  loadTab,
  reloadTab,
  stopTab,
  backTab,
  forwardTab,
  navState,
  zoomGet,
  zoomSet,
  muteTab,
  findTab,
  stopFindTab,
  inputTab,
  executeTab,
  getUrl,
  getTitle,
  getWcId,
  closeTab,
  forceCloseTab,
  setCloseConfirmOverride,
  closeAll,
  getTab,
}
