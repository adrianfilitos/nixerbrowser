const { contextBridge, ipcRenderer } = require('electron')

function detectLoginSubmit() {
  document.addEventListener('submit', (e) => {
    const form = e.target
    if (!form || form.tagName !== 'FORM') return
    const pw = form.querySelector('input[type="password"]')
    if (!pw || !pw.value) return
    const user = form.querySelector('input[type="text"], input[type="email"], input[name*="user" i], input[name*="login" i], input[name*="email" i]')
    ipcRenderer.send('login-submit', { origin: location.origin, username: user ? user.value : '', password: pw.value })
  }, true)
}

function setupAutofill() {
  document.addEventListener('focusin', (e) => {
    const t = e.target
    if (t && t.tagName === 'INPUT' && !t.value && (t.type === 'password' || t.type === 'text' || t.type === 'email')) {
      ipcRenderer.send('autofill-request', { origin: location.origin })
    }
  }, true)
  ipcRenderer.on('autofill-response', (_e, cred) => {
    if (!cred) return
    const pw = document.querySelector('input[type="password"]')
    if (pw && !pw.value) pw.value = cred.password
    const user = document.querySelector('input[type="email"], input[type="text"][autocomplete="username"], input[name*="user" i], input[name*="login" i], input[name*="email" i], input[type="text"]:not([autocomplete])')
    if (user && !user.value) user.value = cred.username
  })
}

function injectContentScripts() {
  if (!window.chrome) window.chrome = {}
  if (!window.chrome.runtime) {
    window.chrome.runtime = {
      id: 'nixer-extension',
      getURL: (p) => p,
      sendMessage: (msg) => { window.dispatchEvent(new CustomEvent('nixer-msg', { detail: msg })) },
      onMessage: {
        addListener: (cb) => { window.addEventListener('nixer-msg', (e) => { if (cb) cb(e.detail, null, () => {}) }) },
      },
    }
  }
  if (!window.chrome.storage) window.chrome.storage = {}
  if (!window.chrome.storage.local) {
    window.chrome.storage.local = {
      get: (keys, cb) => { ipcRenderer.invoke('ext-storage-get', keys).then((v) => cb && cb(v)) },
      set: (items, cb) => { ipcRenderer.invoke('ext-storage-set', items).then(() => cb && cb()) },
    }
  }
  ipcRenderer.send('content-scripts', { url: location.href })
  ipcRenderer.once('content-scripts-result', (_e, scripts) => {
    for (const code of scripts) {
      try {
        ;(0, eval)(code)
      } catch {}
    }
  })
}

document.addEventListener('DOMContentLoaded', () => {
  detectLoginSubmit()
  setupAutofill()
  injectContentScripts()
})

const IS_INTERNAL_PAGE = /^(nixer:|file:)/.test(location.href)

if (IS_INTERNAL_PAGE) {
  contextBridge.exposeInMainWorld('browserAPI', {
  history: {
    list: (q) => ipcRenderer.invoke('history:list', q),
    clear: () => ipcRenderer.invoke('history:clear'),
    remove: (url) => ipcRenderer.invoke('history:remove', url),
  },
  bookmarks: {
    list: () => ipcRenderer.invoke('bookmarks:list'),
    add: (b) => ipcRenderer.invoke('bookmarks:add', b),
    remove: (id) => ipcRenderer.invoke('bookmarks:remove', id),
    update: (id, patch) => ipcRenderer.invoke('bookmarks:update', id, patch),
    reorder: (ids) => ipcRenderer.invoke('bookmarks:reorder', ids),
    clear: () => ipcRenderer.invoke('bookmarks:clear'),
    export: () => ipcRenderer.invoke('bookmarks:export'),
    import: () => ipcRenderer.invoke('bookmarks:import'),
  },
  downloads: {
    list: () => ipcRenderer.invoke('downloads:list'),
    clear: () => ipcRenderer.invoke('downloads:clear'),
    cancel: (id) => ipcRenderer.invoke('downloads:cancel', id),
    open: (p) => ipcRenderer.invoke('downloads:open', p),
    show: (p) => ipcRenderer.invoke('downloads:show', p),
    folder: (p) => ipcRenderer.invoke('downloads:folder', p),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
    defaults: () => ipcRenderer.invoke('settings:defaults'),
  },
  search: {
    engines: () => ipcRenderer.invoke('search:engines'),
    url: (q) => ipcRenderer.invoke('search:url', q),
    suggest: (q) => ipcRenderer.invoke('search:suggest', q),
  },
  ai: {
    chat: (messages) => ipcRenderer.invoke('ai:chat', messages),
  },
  adblock: {
    stats: () => ipcRenderer.invoke('adblock:stats'),
    refresh: () => ipcRenderer.invoke('adblock:refresh'),
  },
  passwords: {
    list: () => ipcRenderer.invoke('passwords:list'),
    add: (p) => ipcRenderer.invoke('passwords:add', p),
    remove: (id) => ipcRenderer.invoke('passwords:remove', id),
  },
  extensions: {
    list: () => ipcRenderer.invoke('extensions:list'),
    remove: (id) => ipcRenderer.invoke('extensions:remove', id),
    setEnabled: (id, enabled) => ipcRenderer.invoke('extensions:set-enabled', id, enabled),
    load: () => ipcRenderer.invoke('extensions:load'),
    installStore: (storeId) => ipcRenderer.invoke('extensions:install-store', storeId),
    openOptions: (id) => ipcRenderer.invoke('extensions:open-options', id),
    openHomepage: (id) => ipcRenderer.invoke('extensions:open-homepage', id),
  },
  reader: {
    get: (id) => ipcRenderer.invoke('reader:get', id),
  },
  taskmanager: {
    list: () => ipcRenderer.invoke('taskmanager:list'),
  },
  data: {
    clear: (what) => ipcRenderer.invoke('data:clear', what),
  },
  system: {
    setDefaultBrowser: () => ipcRenderer.invoke('set-default-browser'),
    isDefaultBrowser: () => ipcRenderer.invoke('is-default-browser'),
  },
  safe: {
    allow: (host) => ipcRenderer.invoke('safe:allow', host),
  },
  app: {
    info: () => ipcRenderer.invoke('app:info'),
  },
  openTab: (url) => ipcRenderer.send('create-tab', url),
  onDownloads: (cb) => ipcRenderer.on('downloads-updated', (_e, d) => cb(d)),
  })
}
