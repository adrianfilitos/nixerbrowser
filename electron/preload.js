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
  uiReady: () => ipcRenderer.send('ui-ready'),
  dragStart: (info) => ipcRenderer.send('drag-start', info),
  dragMove: (x, y) => ipcRenderer.send('drag-move', x, y),
  dragDrop: (x, y) => ipcRenderer.send('drag-drop', x, y),
  dragCancel: () => ipcRenderer.send('drag-cancel'),
  dragTearoff: (x, y) => ipcRenderer.send('drag-tearoff', x, y),
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
  readerMode: () => ipcRenderer.invoke('reader-mode'),
  taskManagerList: () => ipcRenderer.invoke('taskmanager:list'),

  tabCreate: (payload) => ipcRenderer.invoke('tabs:create', payload),
  tabClose: (id) => ipcRenderer.send('tabs:close', id),
  tabCloseForce: (id) => ipcRenderer.send('tabs:close-force', id),
  tabLoad: (id, url) => ipcRenderer.send('tabs:load', id, url),
  tabReload: (id, noCache) => ipcRenderer.send('tabs:reload', id, noCache),
  tabStop: (id) => ipcRenderer.send('tabs:stop', id),
  tabBack: (id) => ipcRenderer.send('tabs:back', id),
  tabForward: (id) => ipcRenderer.send('tabs:forward', id),
  tabNavState: (id) => ipcRenderer.invoke('tabs:nav-state', id),
  tabZoomGet: (id) => ipcRenderer.invoke('tabs:zoom-get', id),
  tabZoomSet: (id, factor) => ipcRenderer.send('tabs:zoom-set', id, factor),
  tabMute: (id, muted) => ipcRenderer.send('tabs:mute', id, muted),
  tabFind: (id, text, findNext) => ipcRenderer.send('tabs:find', id, text, findNext),
  tabStopFind: (id, action) => ipcRenderer.send('tabs:stop-find', id, action),
  tabInput: (id, ev) => ipcRenderer.send('tabs:input', id, ev),
  tabExecute: (id, code) => ipcRenderer.invoke('tabs:execute', id, code),
  tabGetUrl: (id) => ipcRenderer.invoke('tabs:get-url', id),
  tabGetTitle: (id) => ipcRenderer.invoke('tabs:get-title', id),
  tabGetWc: (id) => ipcRenderer.invoke('tabs:get-wc', id),
  tabsLayout: (visible) => ipcRenderer.send('tabs:layout', visible),
  onTabEvent: (cb) => {
    const l = (_e, ev) => cb(ev)
    ipcRenderer.on('tab-event', l)
    return () => ipcRenderer.removeListener('tab-event', l)
  },

  autocomplete: (q) => ipcRenderer.invoke('autocomplete:query', q),
  aiChat: (messages) => ipcRenderer.invoke('ai:chat', messages),
  aiSearch: (q) => ipcRenderer.invoke('ai:search', q),
  aiPageContext: () => ipcRenderer.invoke('ai:page-context'),
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
  profilesStatus: () => ipcRenderer.invoke('profiles:status'),
  profilesList: () => ipcRenderer.invoke('profiles:list'),
  profileCreateLocal: (name, color) => ipcRenderer.invoke('profiles:create-local', name, color),
  profileSwitch: (id) => ipcRenderer.invoke('profiles:switch', id),
  profileUpdate: (id, patch) => ipcRenderer.invoke('profiles:update', id, patch),
  profileRemove: (id) => ipcRenderer.invoke('profiles:remove', id),
  profileSigninProvider: (provider, adopt) => ipcRenderer.invoke('profiles:signin-provider', provider, adopt),
  profileSignout: () => ipcRenderer.invoke('profiles:signout'),
  profileSyncNow: () => ipcRenderer.invoke('profiles:sync-now'),
  permissionsList: () => ipcRenderer.invoke('permissions:list'),
  permissionsSet: (origin, permission, state) => ipcRenderer.invoke('permissions:set', origin, permission, state),
  permissionsClear: (origin) => ipcRenderer.invoke('permissions:clear', origin),
  permissionsClearAll: () => ipcRenderer.invoke('permissions:clear-all'),
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
  certStatus: (origin) => ipcRenderer.invoke('cert:status', origin),
  clipboardWrite: (text) => ipcRenderer.send('clipboard:write', text),

  minimize: () => ipcRenderer.send('win-minimize'),
  toggleMaximize: () => ipcRenderer.send('win-toggle-maximize'),
  close: () => ipcRenderer.send('win-close'),
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  oskOpen: () => ipcRenderer.invoke('osk:open'),
  oskClose: () => ipcRenderer.send('osk:close'),
  tvInputFocus: () => ipcRenderer.send('tv:input-focus'),
  tvInputBlur: () => ipcRenderer.send('tv:input-blur'),
  uiPointer: (data) => ipcRenderer.send('ui-pointer', data),
  cursorMove: (x, y, visible) => ipcRenderer.send('cursor:move', x, y, visible),
  overlayToggle: () => ipcRenderer.send('overlay:toggle'),
  createWindow: (incognito, url) => ipcRenderer.send('create-window', incognito, url),
  openNewTab: (url) => ipcRenderer.send('create-tab', url),

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
  downloadsList: () => ipcRenderer.invoke('downloads:list'),
  downloadsClear: () => ipcRenderer.invoke('downloads:clear'),
  downloadsRemove: (id) => ipcRenderer.invoke('downloads:remove', id),
  downloadsOpen: (p) => ipcRenderer.invoke('downloads:open', p),
  downloadsShow: (p) => ipcRenderer.invoke('downloads:show', p),
  downloadsCancel: (id) => ipcRenderer.invoke('downloads:cancel', id),
  downloadsPreview: (p) => ipcRenderer.invoke('downloads:preview', p),
  showPopup: (opts) => ipcRenderer.send('popup:show', opts),
  hidePopup: (key) => ipcRenderer.send('popup:hide', key),
  updatePopup: (key, payload) => ipcRenderer.send('popup:update', key, payload),
  onPopupAction: (cb) => {
    const l = (_e, d) => cb(d)
    ipcRenderer.on('popup-action', l)
    return () => ipcRenderer.removeListener('popup-action', l)
  },
  onPopupClosed: (cb) => {
    const l = (_e, key) => cb(key)
    ipcRenderer.on('popup-closed', l)
    return () => ipcRenderer.removeListener('popup-closed', l)
  },
  onOskStatus: (cb) => {
    const l = (_e, open) => cb(open)
    ipcRenderer.on('osk-status', l)
    return () => ipcRenderer.removeListener('osk-status', l)
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

  groups: {
    get: () => ipcRenderer.invoke('groups:get'),
    set: (groups) => ipcRenderer.invoke('groups:set', groups),
  },
  workspaces: {
    save: (name, tabs) => ipcRenderer.invoke('workspaces:save', name, tabs),
    list: () => ipcRenderer.invoke('workspaces:list'),
    remove: (name) => ipcRenderer.invoke('workspaces:delete', name),
    open: (name) => ipcRenderer.invoke('workspaces:open', name),
  },
})
