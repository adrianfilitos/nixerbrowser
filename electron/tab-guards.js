const ctx = require('./ctx')
const safeBrowsing = require('./safe-browsing')
const pageStyle = require('./page-style')
const store = require('./store')

let showContentMenu = null

function setShowContentMenu(fn) {
  showContentMenu = fn
}

// Guards que se aplican a cada pestaña (WebContentsView). Los webContents de
// pestaña se crean con webContents.create() (tipo 'window'), por lo que
// web-contents-created no les aplica los guards del antiguo <webview>.
function attachTabGuards(wc) {
  try {
    wc.on('context-menu', (_ev, params) => {
      const c = ctx.ctxForWc(wc)
      if (c && showContentMenu) showContentMenu(c, wc, params)
    })
  } catch {}
  try { safeBrowsing.attachWebviewGuards(wc) } catch {}
  try { pageStyle.attach(wc) } catch {}
  try {
    wc.on('update-target-url', (_e, url) => {
      const c = ctx.ctxForWc(wc)
      if (c) ctx.sendUi(c, 'status-url', url || '')
    })
  } catch {}
  try {
    wc.setWindowOpenHandler(({ url, disposition, features, frameName }) => {
      // target="_blank" / clics de enlace: se abren como pestaña siempre, no son popups
      const isTabLike = disposition === 'foreground-tab' || disposition === 'background-tab' || disposition === 'default'
      const looksLikePopup = disposition === 'new-window' && ((features && String(features).trim()) || (frameName && frameName !== '_blank'))
      if (isTabLike || !looksLikePopup) {
        const c = ctx.ctxForWc(wc)
        if (c && url) ctx.sendUi(c, 'open-tab', url)
        return { action: 'deny' }
      }
      // window.open() de script con features/nombre: aplicar bloqueo de popups
      if (store.settings().blockPopups) {
        let host = ''
        try { host = new URL(url).hostname } catch {}
        if (host !== 'google.com' && !host.endsWith('.google.com')) return { action: 'deny' }
      }
      const c = ctx.ctxForWc(wc)
      if (c && url) ctx.sendUi(c, 'open-tab', url)
      return { action: 'deny' }
    })
  } catch {}
}

module.exports = { attachTabGuards, setShowContentMenu }
