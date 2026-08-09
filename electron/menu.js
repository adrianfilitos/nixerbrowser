const { BrowserWindow, Menu } = require('electron')
const store = require('./store')
const { currentCtx, activeWc, sendUi } = require('./ctx')
const { broadcastSettings } = require('./util')

function createMenus(deps) {
  const { createWindow, extractReader, savePageOf, saveAsUrl, captureScreenshot, togglePip } = deps

  function buildMenu() {
    const act = (action, data) => { const c = currentCtx(); if (c) sendUi(c, action, data) }
    const wc = () => { const c = currentCtx(); return c ? activeWc(c) : null }
    const template = [
      {
        label: 'Archivo',
        submenu: [
          { label: 'Nueva pestaña', accelerator: 'CmdOrCtrl+T', click: () => act('new-tab') },
          { label: 'Nueva ventana', accelerator: 'CmdOrCtrl+N', click: () => createWindow() },
          { label: 'Nueva ventana de incógnito', accelerator: 'CmdOrCtrl+Shift+N', click: () => createWindow({ incognito: true }) },
          { type: 'separator' },
          { label: 'Cerrar pestaña', accelerator: 'CmdOrCtrl+W', click: () => act('close-tab') },
          { label: 'Reabrir pestaña cerrada', accelerator: 'CmdOrCtrl+Shift+T', click: () => act('restore-tab') },
          { label: 'Cerrar ventana', accelerator: 'CmdOrCtrl+Shift+W', click: () => { const w = BrowserWindow.getFocusedWindow(); if (w) w.close() } },
          { type: 'separator' },
          { label: 'Imprimir', accelerator: 'CmdOrCtrl+P', click: () => { const w = wc(); if (w) w.print({ silent: false, printBackground: true }) } },
          { label: 'Guardar página como…', accelerator: 'CmdOrCtrl+S', click: () => savePageOf(wc()) },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      {
        label: 'Editar',
        submenu: [
          { role: 'undo' },
          { role: 'redo' },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' },
        ],
      },
      {
        label: 'Ver',
        submenu: [
          { label: 'Atrás', accelerator: 'Alt+Left', click: () => { const w = wc(); if (w && w.navigationHistory.canGoBack()) w.navigationHistory.goBack() } },
          { label: 'Adelante', accelerator: 'Alt+Right', click: () => { const w = wc(); if (w && w.navigationHistory.canGoForward()) w.navigationHistory.goForward() } },
          { label: 'Inicio', accelerator: 'Alt+Home', click: () => act('home') },
          { type: 'separator' },
          { label: 'Recargar', accelerator: 'CmdOrCtrl+R', click: () => { const w = wc(); if (w) w.reload() } },
          { label: 'Recargar sin caché', accelerator: 'CmdOrCtrl+Shift+R', click: () => { const w = wc(); if (w) w.reloadIgnoringCache() } },
          { label: 'Detener', accelerator: 'Esc', click: () => { const w = wc(); if (w) w.stop() } },
          { type: 'separator' },
          { label: 'Acercar', accelerator: 'CmdOrCtrl+=', click: () => { const w = wc(); if (w) w.setZoomFactor(Math.min(3, (w.getZoomFactor() || 1) + 0.1)) } },
          { label: 'Alejar', accelerator: 'CmdOrCtrl+-', click: () => { const w = wc(); if (w) w.setZoomFactor(Math.max(0.25, (w.getZoomFactor() || 1) - 0.1)) } },
          { label: 'Restablecer zoom', accelerator: 'CmdOrCtrl+0', click: () => { const w = wc(); if (w) w.setZoomFactor(1) } },
          { type: 'separator' },
          { label: 'Pantalla completa', accelerator: 'F11', click: () => { const w = BrowserWindow.getFocusedWindow(); if (w) w.setFullScreen(!w.isFullScreen()) } },
          { label: 'Buscar en página', accelerator: 'CmdOrCtrl+F', click: () => act('open-find') },
          { label: 'Paleta de comandos', accelerator: 'CmdOrCtrl+Shift+P', click: () => act('open-palette') },
          { label: 'Barra de direcciones', accelerator: 'CmdOrCtrl+L', click: () => act('focus-address') },
          { label: 'Herramientas de desarrollo', accelerator: 'F12', click: () => { const w = wc(); if (w) w.openDevTools() } },
          { type: 'separator' },
          { label: 'Modo lectura', accelerator: 'CmdOrCtrl+Shift+M', click: async () => { const w = wc(); const id = await extractReader(w); if (id) act('open-reader', id) } },
          { label: 'Administrador de tareas', accelerator: 'Shift+Esc', click: () => act('open-taskmanager') },
          { type: 'separator' },
          { label: 'Capturar pantalla', accelerator: 'CmdOrCtrl+Shift+S', click: async () => { const f = await captureScreenshot(wc()); if (f) act('ui-toast', { text: 'Captura guardada en ' + f, kind: 'ok' }) } },
          { label: 'Picture-in-Picture', click: () => togglePip(wc()) },
        ],
      },
      {
        label: 'Ayuda',
        submenu: [
          { label: 'Acerca de Nixer Browser', accelerator: 'F1', click: () => act('open-page', 'about') },
        ],
      },
      {
        label: 'Historial',
        submenu: [
          { label: 'Página anterior', accelerator: 'CmdOrCtrl+[', click: () => { const w = wc(); if (w && w.navigationHistory.canGoBack()) w.navigationHistory.goBack() } },
          { label: 'Página siguiente', accelerator: 'CmdOrCtrl+]', click: () => { const w = wc(); if (w && w.navigationHistory.canGoForward()) w.navigationHistory.goForward() } },
          { label: 'Inicio', click: () => act('home') },
          { type: 'separator' },
          { label: 'Pestaña siguiente', accelerator: 'CmdOrCtrl+Tab', click: () => act('cycle-tab', 1) },
          { label: 'Pestaña anterior', accelerator: 'CmdOrCtrl+Shift+Tab', click: () => act('cycle-tab', -1) },
          { type: 'separator' },
          { label: 'Gestionar historial', accelerator: 'CmdOrCtrl+H', click: () => act('open-page', 'history') },
        ],
      },
      {
        label: 'Marcadores',
        submenu: [
          { label: 'Añadir esta página', accelerator: 'CmdOrCtrl+D', click: () => act('bookmark-page') },
          { label: 'Gestionar marcadores', accelerator: 'CmdOrCtrl+Shift+O', click: () => act('open-page', 'bookmarks') },
          { type: 'separator' },
          {
            label: 'Mostrar barra de marcadores',
            type: 'checkbox',
            checked: store.settings().showBookmarksBar,
            click: (item) => {
              store.setSettings({ showBookmarksBar: item.checked })
              broadcastSettings()
            },
          },
        ],
      },
      {
        label: 'IA',
        submenu: [
          { label: 'Chat con IA', accelerator: 'CmdOrCtrl+Alt+A', click: () => act('open-page', 'ai') },
          { label: 'Configurar IA', click: () => act('open-page', 'settings') },
        ],
      },
      {
        label: 'Ajustes',
        submenu: [
          { label: 'Ajustes', accelerator: 'CmdOrCtrl+,', click: () => act('open-page', 'settings') },
          { label: 'Descargas', accelerator: 'CmdOrCtrl+J', click: () => act('open-page', 'downloads') },
        ],
      },
    ]
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  }

  function showContentMenu(ctx, wc, params) {
    const template = []
    if (params.linkURL) {
      template.push({ label: 'Abrir enlace en pestaña nueva', click: () => sendUi(ctx, 'open-tab', params.linkURL) })
      template.push({ label: 'Abrir enlace en ventana de incógnito', click: () => { const c2 = createWindow({ incognito: true }); setTimeout(() => sendUi(c2, 'open-tab', params.linkURL), 900) } })
      template.push({ label: 'Copiar dirección del enlace', click: () => { if (wc) wc.copy(params.linkURL) } })
      template.push({ type: 'separator' })
    }
    if (params.isEditable) {
      template.push({ label: 'Cortar', role: 'cut' }, { label: 'Copiar', role: 'copy' }, { label: 'Pegar', role: 'paste' }, { label: 'Seleccionar todo', role: 'selectAll' })
      template.push({ type: 'separator' })
    }
    if (params.selectionText) {
      template.push({ label: 'Buscar: "' + params.selectionText.slice(0, 40) + '"', click: () => sendUi(ctx, 'open-tab', store.searchUrl(params.selectionText)) })
      template.push({ label: 'Copiar', role: 'copy' })
      template.push({ type: 'separator' })
    }
    template.push(
      { label: 'Atrás', click: () => { if (wc && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack() } },
      { label: 'Adelante', click: () => { if (wc && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward() } },
      { label: 'Recargar', click: () => wc && wc.reload() }
    )
    template.push({ type: 'separator' })
    if (params.mediaType === 'image') {
      template.push({ label: 'Guardar imagen como…', click: () => saveAsUrl(BrowserWindow.fromWebContents(wc), params.srcURL) })
      template.push({ label: 'Copiar dirección de la imagen', click: () => { if (wc) wc.copy(params.srcURL) } })
      template.push({ label: 'Abrir imagen en pestaña nueva', click: () => sendUi(ctx, 'open-tab', params.srcURL) })
      template.push({ type: 'separator' })
    }
    if (params.linkURL) {
      template.push({ label: 'Guardar enlace como…', click: () => saveAsUrl(BrowserWindow.fromWebContents(wc), params.linkURL) })
      template.push({ type: 'separator' })
    }
    template.push({ label: 'Guardar página como…', click: () => savePageOf(wc) })
    template.push({ label: 'Imprimir', click: () => wc && wc.print({ silent: false, printBackground: true }) })
    template.push({ label: 'Capturar pantalla', click: async () => { await captureScreenshot(wc) } })
    template.push({ label: 'Picture-in-Picture', click: () => togglePip(wc) })
    template.push({
      label: 'Modo lectura',
      click: async () => {
        const id = await extractReader(wc)
        if (id) sendUi(ctx, 'open-reader', id)
      },
    })
    template.push({ type: 'separator' })
    template.push({ label: 'Inspeccionar elemento', click: () => wc && wc.openDevTools() })
    const win = BrowserWindow.fromWebContents(wc)
    if (win) Menu.buildFromTemplate(template).popup({ window: win })
  }

  return { buildMenu, showContentMenu }
}

module.exports = { createMenus }
