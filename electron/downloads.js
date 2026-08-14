const { app, BrowserWindow, dialog, session, shell, Notification } = require('electron')
const path = require('path')
const store = require('./store')
const { currentCtx, sendUi } = require('./ctx')
const { broadcastDownloads } = require('./util')
const { installExtensionFromStore } = require('./extensions')

const pendingSaveUrls = [] // FIFO: { filePath, url, ts }
const activeItems = new Map()
let dlSeq = 1

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
    const forced = takePendingSavePath(url, item.getFilename())
    if (forced) {
      item.setSavePath(forced)
    } else if (store.settings().askDownloadLocation) {
      item.setSaveDialogOptions({ defaultPath: path.join(app.getPath('downloads'), item.getFilename()), filters: [{ name: 'Archivo', extensions: ['*'] }] })
    }
    const rec = {
      id: Date.now() + '-' + (dlSeq++),
      name: item.getFilename(),
      url,
      path: item.getSavePath(),
      received: 0,
      total: item.getTotalBytes(),
      state: 'in-progress',
    }
    activeItems.set(rec.id, item)
    store.upsertDownload(rec)
    broadcastDownloads()
    item.on('updated', () => {
      rec.received = item.getReceivedBytes()
      rec.total = item.getTotalBytes()
      broadcastDownloads()
    })
    item.on('done', (_e2, state) => {
      activeItems.delete(rec.id)
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

function cancelDownload(id) {
  const item = activeItems.get(id)
  if (!item) return false
  try { item.cancel() } catch {}
  return true
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
  pendingSaveUrls.push({ filePath, url, ts: Date.now() })
  session.defaultSession.downloadURL(url)
}

// Consume la ruta elegida en "Guardar enlace como…" aunque el servidor redirija
// la descarga (entonces item.getURL() difiere de la URL pedida y no habría match
// exacto). Si no hay una petición de guardado reciente, devuelve null.
function takePendingSavePath(url, filename) {
  const now = Date.now()
  for (let i = 0; i < pendingSaveUrls.length; i++) {
    const p = pendingSaveUrls[i]
    if (now - p.ts > 5000) {
      pendingSaveUrls.splice(i, 1)
      i--
      continue
    }
    const sameUrl = p.url === url
    const sameFile = filename && decodeURIComponent((p.url.split('/').pop().split('?')[0] || '')) === filename
    if (sameUrl || sameFile) {
      pendingSaveUrls.splice(i, 1)
      return p.filePath
    }
  }
  return null
}

module.exports = { initDownloads, savePageOf, saveAsUrl, cancelDownload }
