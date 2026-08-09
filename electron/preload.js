const { contextBridge, ipcRenderer } = require('electron')

try {
  const { injectBrowserAction } = require('electron-chrome-extensions/browser-action')
  injectBrowserAction()
} catch (e) {
  console.log('INJECT_BA_ERR:', e && (e.stack || e.message))
}

contextBridge.exposeInMainWorld('api', {
  viewInfo: () => ipcRenderer.invoke('view-info'),
  windowInfo: () => ipcRenderer.invoke('window-info'),
  dragStart: (info) => ipcRenderer.send('drag-start', info),
  dragMove: (x, y) => ipcRenderer.send('drag-move', x, y),
  dragDrop: (x, y) => ipcRenderer.send('drag-drop', x, y),
  dragCancel: () => ipcRenderer.send('drag-cancel'),
  getDragState: () => ipcRenderer.invoke('get-drag-state'),
  dockDragged: () => ipcRenderer.invoke('dock-dragged'),
  setActiveWc: (wcId) => ipcRenderer.send('set-active-wc', wcId),
  addHistory: (entry) => ipcRenderer.send('add-history', entry),
  updateHistoryTitle: (url, title) => ipcRenderer.send('history:update-title', url, title),
  saveSession: (urls) => ipcRenderer.send('save-session', urls),
  getSession: () => ipcRenderer.invoke('get-session'),
  getUrlOverrides: () => ipcRenderer.invoke('get-url-overrides'),
  savePage: () => ipcRenderer.invoke('save-page'),
  print: () => ipcRenderer.invoke('print-wc'),
  saveAs: (url) => ipcRenderer.invoke('save-as', url),
  readerMode: () => ipcRenderer.invoke('reader-mode'),
  taskManagerList: () => ipcRenderer.invoke('taskmanager:list'),

  autocomplete: (q) => ipcRenderer.invoke('autocomplete:query', q),
  aiChat: (messages) => ipcRenderer.invoke('ai:chat', messages),
  openPage: (key) => ipcRenderer.send('open-page', key),
  getBookmarks: () => ipcRenderer.invoke('bookmarks:list'),
  addBookmark: (b) => ipcRenderer.invoke('bookmarks:add', b),
  removeBookmark: (id) => ipcRenderer.invoke('bookmarks:remove', id),
  exportBookmarks: () => ipcRenderer.invoke('bookmarks:export'),
  importBookmarks: () => ipcRenderer.invoke('bookmarks:import'),
  reorderBookmarks: (ids) => ipcRenderer.invoke('bookmarks:reorder', ids),
  isBookmarked: (url) => ipcRenderer.invoke('bookmarks:is-bookmarked', url),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSetting: (patch) => ipcRenderer.invoke('settings:set', patch),
  searchEngines: () => ipcRenderer.invoke('search:engines'),
  searchUrl: (q) => ipcRenderer.invoke('search:url', q),
  searchSuggest: (q) => ipcRenderer.invoke('search:suggest', q),
  searchRecent: (q) => ipcRenderer.invoke('search:recent', q),
  searchRecord: (q) => ipcRenderer.send('search:record', q),
  removeHistory: (url) => ipcRenderer.invoke('history:remove', url),
  installSite: (url, title) => ipcRenderer.invoke('site:install', url, title),
  shieldsGet: (origin) => ipcRenderer.invoke('shields:get', origin),
  shieldsSet: (origin, patch) => ipcRenderer.invoke('shields:set', { origin, patch }),
  adblockRecent: () => ipcRenderer.invoke('adblock:recent'),
  siteCookies: (origin) => ipcRenderer.invoke('site:cookies', origin),
  siteClear: (origin) => ipcRenderer.invoke('site:clear', origin),

  minimize: () => ipcRenderer.send('win-minimize'),
  toggleMaximize: () => ipcRenderer.send('win-toggle-maximize'),
  close: () => ipcRenderer.send('win-close'),
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  createWindow: (incognito, url) => ipcRenderer.send('create-window', incognito, url),
  openNewTab: (url) => ipcRenderer.send('create-tab', url),

  onTabs: (cb) => {}, // tabs are local to the renderer now
  onNavigation: (cb) => {},
  onSettings: (cb) => {
    const l = (_e, d) => cb(d)
    ipcRenderer.on('settings-updated', l)
    return () => ipcRenderer.removeListener('settings-updated', l)
  },
  onDownloads: (cb) => {
    const l = (_e, d) => cb(d)
    ipcRenderer.on('downloads-updated', l)
    return () => ipcRenderer.removeListener('downloads-updated', l)
  },
  onMaximized: (cb) => {
    const l = (_e, d) => cb(d)
    ipcRenderer.on('win-maximized', l)
    return () => ipcRenderer.removeListener('win-maximized', l)
  },
  onPermissionRequest: (cb) => {
    const l = (_e, d) => cb(d)
    ipcRenderer.on('permission-request', l)
    return () => ipcRenderer.removeListener('permission-request', l)
  },
  onSavePasswordPrompt: (cb) => {
    const l = (_e, d) => cb(d)
    ipcRenderer.on('save-password-prompt', l)
    return () => ipcRenderer.removeListener('save-password-prompt', l)
  },
  onUi: (cb) => {
    const l = (_e, action, data) => cb(action, data)
    ipcRenderer.on('ui-action', l)
    return () => ipcRenderer.removeListener('ui-action', l)
  },

  permissionResponse: (payload) => ipcRenderer.send('permission-response', payload),
  savePassword: (cred) => ipcRenderer.send('password-save', cred),
  autofillForm: () => ipcRenderer.send('autofill-form'),

  extensionsList: () => ipcRenderer.invoke('extensions:list'),
  extensionsSetEnabled: (id, enabled) => ipcRenderer.invoke('extensions:set-enabled', id, enabled),
  extensionsRemove: (id) => ipcRenderer.invoke('extensions:remove', id),
})
