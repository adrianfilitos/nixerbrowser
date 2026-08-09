const { app, BrowserWindow, dialog, session, shell, Notification } = require('electron')
const path = require('path')
const store = require('./store')
const { currentCtx, sendUi } = require('./ctx')
const { broadcastDownloads } = require('./util')
const { installExtensionFromStore } = require('./extensions')

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
    } else if (store.settings().askDownloadLocation) {
      const win = BrowserWindow.getFocusedWindow()
      const opts = { defaultPath: path.join(app.getPath('downloads'), item.getFilename()), filters: [{ name: 'Archivo', extensions: ['*'] }] }
      const res = dialog.showSaveDialogSync(win, opts)
      if (res && res.filePath) item.setSavePath(res.filePath)
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
      if (state === 'completed') {
        if (store.settings().openFolderWhenDone) {
          try { shell.showItemInFolder(item.getSavePath()) } catch {}
        }
        if (store.settings().showDownloadNotifications) {
          try {
            const n = new Notification({ title: 'Descarga completada', body: item.getFilename() })
            n.show()
          } catch {}
        }
      }
    })
  })
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

module.exports = { initDownloads, savePageOf, saveAsUrl }
