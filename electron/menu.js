const { BrowserWindow, Menu, clipboard } = require('electron')
const store = require('./store')
const { currentCtx, activeWc, sendUi } = require('./ctx')
const { broadcastSettings } = require('./util')

function readAloud(wc, text) {
  if (!wc) return
  const content = text || ''
  const js = `(function () {
    try {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel()
        const u = new SpeechSynthesisUtterance(${JSON.stringify(content)})
        u.lang = 'es'
        window.speechSynthesis.speak(u)
      }
    } catch (e) {}
    return true
  })()`
  try { wc.executeJavaScript(js) } catch {}
}

const EN = {
  'Archivo': 'File', 'Nueva pestaña': 'New Tab', 'Nueva ventana': 'New Window', 'Nueva ventana de incógnito': 'New Incognito Window',
  'Cerrar pestaña': 'Close Tab', 'Reabrir pestaña cerrada': 'Reopen Closed Tab', 'Cerrar ventana': 'Close Window',
  'Imprimir': 'Print', 'Guardar página como…': 'Save Page As…', 'Pestaña 1': 'Tab 1', 'Pestaña 2': 'Tab 2', 'Pestaña 3': 'Tab 3',
  'Pestaña 4': 'Tab 4', 'Pestaña 5': 'Tab 5', 'Pestaña 6': 'Tab 6', 'Pestaña 7': 'Tab 7', 'Pestaña 8': 'Tab 8',
  'Última pestaña': 'Last Tab', 'Guardar como espacio de trabajo…': 'Save as Workspace…', 'Espacios de trabajo': 'Workspaces',
  'Editar': 'Edit', 'Cortar': 'Cut', 'Copiar': 'Copy', 'Pegar': 'Paste', 'Seleccionar todo': 'Select All', 'Deshacer': 'Undo', 'Rehacer': 'Redo',
  'Ver': 'View', 'Atrás': 'Back', 'Adelante': 'Forward', 'Inicio': 'Home', 'Recargar': 'Reload', 'Recargar sin caché': 'Hard Reload',
  'Detener': 'Stop', 'Acercar': 'Zoom In', 'Alejar': 'Zoom Out', 'Restablecer zoom': 'Reset Zoom', 'Pantalla completa': 'Fullscreen',
  'Buscar en página': 'Find in Page', 'Paleta de comandos': 'Command Palette', 'Barra de direcciones': 'Address Bar',
  'Enfocar barra de direcciones': 'Focus Address Bar', 'Barra lateral': 'Sidebar', 'Buscar pestañas': 'Search Tabs',
  'Modo presentación': 'Presentation Mode', 'Herramientas de desarrollo': 'Developer Tools', 'Modo lectura': 'Reader Mode',
  'Administrador de tareas': 'Task Manager', 'Capturar pantalla': 'Take Screenshot', 'Copiar URL': 'Copy URL',
  'Ver código fuente': 'View Source', 'Silenciar pestaña': 'Mute Tab', 'Traducir página': 'Translate Page',
  'Instalar sitio como acceso directo': 'Install Site Shortcut', 'Ayuda': 'Help', 'Acerca de Nixer Browser': 'About Nixer Browser',
  'Créditos y licencias': 'Credits and Licenses', 'Historial': 'History', 'Página anterior': 'Previous Page', 'Página siguiente': 'Next Page',
  'Pestaña siguiente': 'Next Tab', 'Pestaña anterior': 'Previous Tab', 'Mover pestaña a la izquierda': 'Move Tab Left',
  'Mover pestaña a la derecha': 'Move Tab Right', 'Copiar título de la página': 'Copy Page Title', 'Copiar como Markdown': 'Copy as Markdown',
  'Gestionar historial': 'Manage History', 'Marcadores': 'Bookmarks', 'Añadir esta página': 'Add This Page',
  'Añadir todas las pestañas': 'Bookmark All Tabs', 'Gestionar marcadores': 'Manage Bookmarks', 'Mostrar barra de marcadores': 'Show Bookmarks Bar',
  'IA': 'AI', 'Chat con IA': 'AI Chat', 'Configurar IA': 'Configure AI', 'Resumir esta página': 'Summarize This Page',
  'Ajustes': 'Settings', 'Perfiles': 'Profiles', 'Lista de lectura': 'Reading List', 'Descargas': 'Downloads',
  'Contraseñas': 'Passwords', 'Abrir carpeta de descargas': 'Open Downloads Folder',
}

function tr(label) {
  if (store.settings().language === 'en' && EN[label]) return EN[label]
  return label
}

function createMenus(deps) {
  const { createWindow, extractReader, savePageOf, saveAsUrl, captureScreenshot, togglePip, ai, readerGet, readerPut } = deps

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
          { label: 'Guardar como espacio de trabajo…', click: () => act('save-workspace') },
          { label: 'Espacios de trabajo', click: () => act('open-page', 'workspaces') },
          { label: 'Cerrar ventana', accelerator: 'CmdOrCtrl+Shift+W', click: () => { const w = BrowserWindow.getFocusedWindow(); if (w) w.close() } },
          { type: 'separator' },
          { label: 'Pestaña 1', accelerator: 'CmdOrCtrl+1', click: () => act('goto-tab', 0) },
          { label: 'Pestaña 2', accelerator: 'CmdOrCtrl+2', click: () => act('goto-tab', 1) },
          { label: 'Pestaña 3', accelerator: 'CmdOrCtrl+3', click: () => act('goto-tab', 2) },
          { label: 'Pestaña 4', accelerator: 'CmdOrCtrl+4', click: () => act('goto-tab', 3) },
          { label: 'Pestaña 5', accelerator: 'CmdOrCtrl+5', click: () => act('goto-tab', 4) },
          { label: 'Pestaña 6', accelerator: 'CmdOrCtrl+6', click: () => act('goto-tab', 5) },
          { label: 'Pestaña 7', accelerator: 'CmdOrCtrl+7', click: () => act('goto-tab', 6) },
          { label: 'Pestaña 8', accelerator: 'CmdOrCtrl+8', click: () => act('goto-tab', 7) },
          { label: 'Última pestaña', accelerator: 'CmdOrCtrl+9', click: () => act('goto-tab', 99) },
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
          { label: 'Enfocar barra de direcciones', accelerator: 'F6', click: () => act('focus-address') },
          { label: 'Barra lateral', accelerator: 'CmdOrCtrl+Shift+B', click: () => act('toggle-sidebar') },
          { label: 'Buscar pestañas', accelerator: 'CmdOrCtrl+Shift+A', click: () => act('open-tab-search') },
          { label: 'Modo presentación', click: () => act('toggle-presentation') },
          { label: 'Herramientas de desarrollo', accelerator: 'F12', click: () => { const w = wc(); if (w) w.openDevTools() } },
          { type: 'separator' },
          { label: 'Copiar URL', accelerator: 'CmdOrCtrl+Shift+L', click: () => act('copy-url') },
          { label: 'Ver código fuente', accelerator: 'CmdOrCtrl+U', click: () => act('view-source') },
          { label: 'Traducir página', click: () => act('translate-page') },
          { label: 'Instalar sitio como acceso directo', click: () => act('install-site') },
          { label: 'Silenciar pestaña', accelerator: 'CmdOrCtrl+M', click: () => act('toggle-mute') },
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
          { label: 'Créditos y licencias', click: () => act('open-page', 'credits') },
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
          { label: 'Página siguiente', accelerator: 'PageDown', click: () => act('cycle-tab', 1) },
          { label: 'Página anterior', accelerator: 'PageUp', click: () => act('cycle-tab', -1) },
          { label: 'Mover pestaña a la izquierda', accelerator: 'Alt+Shift+Left', click: () => act('move-tab', -1) },
          { label: 'Mover pestaña a la derecha', accelerator: 'Alt+Shift+Right', click: () => act('move-tab', 1) },
          { type: 'separator' },
          { label: 'Copiar título de la página', click: () => act('copy-title') },
          { label: 'Copiar como Markdown', click: () => act('copy-markdown') },
          { label: 'Gestionar historial', accelerator: 'CmdOrCtrl+H', click: () => act('open-page', 'history') },
        ],
      },
      {
        label: 'Marcadores',
        submenu: [
          { label: 'Añadir esta página', accelerator: 'CmdOrCtrl+D', click: () => act('bookmark-page') },
          { label: 'Añadir todas las pestañas', click: () => act('bookmark-all') },
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
          { label: 'Resumir esta página', click: async () => {
            const w = wc()
            const id = await extractReader(w)
            if (!id) return
            const content = readerGet(id)
            if (!content || !content.text) return
            const res = await ai.chat([{ role: 'user', content: 'Resume esta página en unas pocas frases claras:\n\n' + content.text.slice(0, 12000) }])
            const text = res && res.text ? res.text : 'No se pudo resumir: ' + ((res && res.error) || 'sin respuesta')
            const rid = readerPut({ title: 'Resumen de ' + (content.title || 'la página'), url: content.url || '', text })
            act('open-reader', rid)
          } },
        ],
      },
      {
        label: 'Ajustes',
        submenu: [
          { label: 'Ajustes', accelerator: 'CmdOrCtrl+,', click: () => act('open-page', 'settings') },
          { label: 'Perfiles', click: () => act('open-page', 'profiles') },
          { label: 'Lista de lectura', click: () => act('open-page', 'readinglist') },
          { label: 'Descargas', accelerator: 'CmdOrCtrl+J', click: () => act('open-page', 'downloads') },
          { label: 'Contraseñas', click: () => act('open-page', 'passwords') },
          { label: 'Abrir carpeta de descargas', click: () => { try { require('electron').shell.openPath(require('electron').app.getPath('downloads')) } catch {} } },
        ],
      },
    ]
    const translate = (items) => items.forEach((i) => { if (i.label) i.label = tr(i.label); if (i.submenu) translate(i.submenu) })
    translate(template)
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  }

  function showContentMenu(ctx, wc, params) {
    const template = []
    if (params.linkURL) {
    template.push({ label: 'Abrir enlace en pestaña nueva', click: () => sendUi(ctx, 'open-tab', params.linkURL) })
    template.push({ label: 'Abrir enlace en pestaña de fondo', click: () => sendUi(ctx, 'open-tab-bg', params.linkURL) })
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
    template.push({ label: 'Copiar como texto plano', click: () => clipboard.writeText(params.selectionText) })
    template.push({ label: 'Copiar enlace con título', click: () => { const t = (params.linkText || params.selectionText || '').trim(); clipboard.writeText((t ? t + ' ' : '') + (params.linkURL || '')) } })
    template.push({ label: 'Traducir selección', click: () => sendUi(ctx, 'open-tab', 'https://translate.google.com/?sl=auto&tl=es&text=' + encodeURIComponent(params.selectionText)) })
    template.push({ label: 'Leer selección en voz alta', click: () => readAloud(wc, params.selectionText) })
    template.push({ label: 'Contar palabras', click: () => { const w = params.selectionText.trim().split(/\s+/).filter(Boolean).length; const c = params.selectionText.length; sendUi(ctx, 'ui-toast', { text: w + ' palabras · ' + c + ' caracteres', kind: 'info' }) } })
    template.push({
      label: 'Explicar con la IA',
      click: async () => {
        const res = await ai.chat([{ role: 'user', content: 'Explica brevemente lo siguiente:\n\n' + params.selectionText.slice(0, 8000) }])
        const text = res && res.text ? res.text : 'No se pudo explicar: ' + ((res && res.error) || 'sin respuesta')
        const rid = readerPut({ title: 'Explicación', url: '', text })
        sendUi(ctx, 'open-reader', rid)
      },
    })
    template.push({
      label: 'Corregir gramática con la IA',
      click: async () => {
        const res = await ai.chat([{ role: 'user', content: 'Corrige la gramática y ortografía de este texto, devuelve solo el texto corregido:\n\n' + params.selectionText.slice(0, 8000) }])
        const text = res && res.text ? res.text : 'No se pudo corregir: ' + ((res && res.error) || 'sin respuesta')
        const rid = readerPut({ title: 'Texto corregido', url: '', text })
        sendUi(ctx, 'open-reader', rid)
      },
    })
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
    template.push({ label: 'Abrir imagen en ventana de incógnito', click: () => { const c2 = createWindow({ incognito: true }); setTimeout(() => sendUi(c2, 'open-tab', params.srcURL), 900) } })
    template.push({ label: 'Buscar imagen en Google', click: () => sendUi(ctx, 'open-tab', 'https://www.google.com/searchbyimage?image_url=' + encodeURIComponent(params.srcURL)) })
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
  template.push({ label: 'Ver código fuente', click: () => { const u = wc && wc.getURL(); if (u && /^https?:/.test(u)) sendUi(ctx, 'open-tab', 'view-source:' + u) } })
  template.push({ label: 'Leer página en voz alta', click: () => readAloud(wc, '') })
  template.push({ label: 'Ver código QR', click: () => { const u = wc && wc.getURL(); if (u && /^https?:/.test(u)) sendUi(ctx, 'open-tab', 'nixer://qr?url=' + encodeURIComponent(u)) } })
  template.push({ label: 'Abrir en ventana de incógnito', click: () => { const u = wc && wc.getURL(); if (u && /^https?:/.test(u)) { const c2 = createWindow({ incognito: true }); setTimeout(() => sendUi(c2, 'open-tab', u), 900) } } })
    template.push({ type: 'separator' })
    template.push({ label: 'Inspeccionar elemento', click: () => wc && wc.openDevTools() })
    const win = BrowserWindow.fromWebContents(wc)
    if (win) Menu.buildFromTemplate(template).popup({ window: win })
  }

  return { buildMenu, showContentMenu }
}

module.exports = { createMenus }
