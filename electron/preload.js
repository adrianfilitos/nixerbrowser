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
  getBookmarks: () => ipcRenderer.invoke('bookmarks:list'),
  addBookmark: (b) => ipcRenderer.invoke('bookmarks:add', b),
  removeBookmark: (id) => ipcRenderer.invoke('bookmarks:remove', id),
  isBookmarked: (url) => ipcRenderer.invoke('bookmarks:is-bookmarked', url),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSetting: (patch) => ipcRenderer.invoke('settings:set', patch),
  searchEngines: () => ipcRenderer.invoke('search:engines'),
  searchUrl: (q) => ipcRenderer.invoke('search:url', q),
  shieldsGet: (origin) => ipcRenderer.invoke('shields:get', origin),
  shieldsSet: (origin, patch) => ipcRenderer.invoke('shields:set', { origin, patch }),
  adblockRecent: () => ipcRenderer.invoke('adblock:recent'),
  siteCookies: (origin) => ipcRenderer.invoke('site:cookies', origin),
  siteClear: (origin) => ipcRenderer.invoke('site:clear', origin),

  minimize: () => ipcRenderer.send('win-minimize'),
  toggleMaximize: () => ipcRenderer.send('win-toggle-maximize'),
  close: () => ipcRenderer.send('win-close'),
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  createWindow: (incognito) => ipcRenderer.send('create-window', incognito),

  onTabs: (cb) => {}, // tabs are local to the renderer now
  onNavigation: (cb) => {},
  onSettings: (cb) => ipcRenderer.on('settings-updated', (_e, d) => cb(d)),
  onDownloads: (cb) => ipcRenderer.on('downloads-updated', (_e, d) => cb(d)),
  onMaximized: (cb) => ipcRenderer.on('win-maximized', (_e, d) => cb(d)),
  onPermissionRequest: (cb) => ipcRenderer.on('permission-request', (_e, d) => cb(d)),
  permissionResponse: (payload) => ipcRenderer.send('permission-response', payload),
  onSavePasswordPrompt: (cb) => ipcRenderer.on('save-password-prompt', (_e, d) => cb(d)),
  savePassword: (cred) => ipcRenderer.send('password-save', cred),
  autofillForm: () => ipcRenderer.send('autofill-form'),
  onUi: (cb) => ipcRenderer.on('ui-action', (_e, action, data) => cb(action, data)),
})
