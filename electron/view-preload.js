const { contextBridge, ipcRenderer, webFrame } = require('electron')

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

function setupTvKeyboard() {
  const isEditable = (t) => {
    if (!t || t === document.body) return false
    const tag = (t.tagName || '').toUpperCase()
    return tag === 'INPUT' || tag === 'TEXTAREA' || t.isContentEditable
  }
  document.addEventListener('focusin', (e) => {
    if (isEditable(e.target)) ipcRenderer.send('tv:input-focus')
  }, true)
  document.addEventListener('focusout', (e) => {
    if (isEditable(e.target)) ipcRenderer.send('tv:input-blur')
  }, true)
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

function injectCosmetic() {
  if (window !== window.top) return
  if (!/^https?:/.test(location.href)) return
  const host = location.hostname.toLowerCase()
  const apply = (css) => {
    if (!css) return
    try {
      const st = document.createElement('style')
      st.type = 'text/css'
      st.textContent = css
      ;(document.head || document.documentElement).appendChild(st)
    } catch {}
  }
  const poll = (n) => {
    ipcRenderer.invoke('adblock:cosmetic', host).then((css) => {
      if (css) apply(css)
      else if (n > 0) setTimeout(() => poll(n - 1), 1500)
    }).catch(() => {})
  }
  poll(6)
}

function injectYoutubeAdBlock() {
  const host = location.hostname.toLowerCase()
  if (host !== 'youtube.com' && host !== 'www.youtube.com' && host !== 'music.youtube.com' && !host.endsWith('.youtube.com')) return
  ipcRenderer.invoke('yt-ad-script').then((code) => {
    if (!code) return
    const inject = () => {
      try {
        if (!document.documentElement) return false
        if (document.getElementById('nixer-yt-ad')) return true
        const s = document.createElement('script')
        s.id = 'nixer-yt-ad'
        s.type = 'text/javascript'
        s.textContent = code
        ;(document.head || document.documentElement).appendChild(s)
        return true
      } catch {
        return false
      }
    }
    if (!inject()) {
      let n = 0
      const t = setInterval(() => {
        if (inject() || n++ > 120) clearInterval(t)
      }, 40)
    }
    try {
      if (webFrame && webFrame.executeJavaScript) webFrame.executeJavaScript(code).catch(() => {})
    } catch {}
  }).catch(() => {})
}

injectYoutubeAdBlock()

document.addEventListener('DOMContentLoaded', () => {
  detectLoginSubmit()
  setupAutofill()
  setupTvKeyboard()
  injectContentScripts()
  injectCosmetic()
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
    importChrome: () => ipcRenderer.invoke('bookmarks:import-chrome'),
    importChromeFull: () => ipcRenderer.invoke('import-chrome-full'),
  },
  downloads: {
    list: () => ipcRenderer.invoke('downloads:list'),
    clear: () => ipcRenderer.invoke('downloads:clear'),
    remove: (id) => ipcRenderer.invoke('downloads:remove', id),
    cancel: (id) => ipcRenderer.invoke('downloads:cancel', id),
    open: (p) => ipcRenderer.invoke('downloads:open', p),
    show: (p) => ipcRenderer.invoke('downloads:show', p),
    folder: (p) => ipcRenderer.invoke('downloads:folder', p),
    preview: (p) => ipcRenderer.invoke('downloads:preview', p),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
    defaults: () => ipcRenderer.invoke('settings:defaults'),
  },
  profiles: {
    status: () => ipcRenderer.invoke('profiles:status'),
    list: () => ipcRenderer.invoke('profiles:list'),
    createLocal: (name, color) => ipcRenderer.invoke('profiles:create-local', name, color),
    switch: (id) => ipcRenderer.invoke('profiles:switch', id),
    update: (id, patch) => ipcRenderer.invoke('profiles:update', id, patch),
    remove: (id) => ipcRenderer.invoke('profiles:remove', id),
    signupCloud: (email, password, adopt) => ipcRenderer.invoke('profiles:signup-cloud', email, password, adopt),
    signinCloud: (email, password, adopt) => ipcRenderer.invoke('profiles:signin-cloud', email, password, adopt),
    signinProvider: (provider, adopt) => ipcRenderer.invoke('profiles:signin-provider', provider, adopt),
    signout: () => ipcRenderer.invoke('profiles:signout'),
    syncNow: () => ipcRenderer.invoke('profiles:sync-now'),
  },
  permissions: {
    list: () => ipcRenderer.invoke('permissions:list'),
    set: (origin, permission, state) => ipcRenderer.invoke('permissions:set', origin, permission, state),
    clear: (origin) => ipcRenderer.invoke('permissions:clear', origin),
    clearAll: () => ipcRenderer.invoke('permissions:clear-all'),
  },
  search: {
    engines: () => ipcRenderer.invoke('search:engines'),
    url: (q) => ipcRenderer.invoke('search:url', q),
    suggest: (q) => ipcRenderer.invoke('search:suggest', q),
  },
  ai: {
    chat: (messages) => ipcRenderer.invoke('ai:chat', messages),
  },
  translate: {
    text: (text, tl) => ipcRenderer.invoke('translate:text', text, tl),
  },
  adblock: {
    stats: () => ipcRenderer.invoke('adblock:stats'),
    refresh: () => ipcRenderer.invoke('adblock:refresh'),
  },
  passwords: {
    list: () => ipcRenderer.invoke('passwords:list'),
    add: (p) => ipcRenderer.invoke('passwords:add', p),
    remove: (id) => ipcRenderer.invoke('passwords:remove', id),
    check: () => ipcRenderer.invoke('passwords:check'),
    import: () => ipcRenderer.invoke('passwords:import'),
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
  readinglist: {
    list: () => ipcRenderer.invoke('readinglist:list'),
    add: (item) => ipcRenderer.invoke('readinglist:add', item),
    remove: (id) => ipcRenderer.invoke('readinglist:remove', id),
    open: (id) => ipcRenderer.invoke('readinglist:open', id),
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
  groups: {
    get: () => ipcRenderer.invoke('groups:get'),
    set: (g) => ipcRenderer.invoke('groups:set', g),
  },
  workspaces: {
    list: () => ipcRenderer.invoke('workspaces:list'),
    save: (name, tabs) => ipcRenderer.invoke('workspaces:save', name, tabs),
    open: (name) => ipcRenderer.invoke('workspaces:open', name),
    remove: (name) => ipcRenderer.invoke('workspaces:delete', name),
  },
  openTab: (url) => ipcRenderer.send('create-tab', url),
  onDownloads: (cb) => {
    const l = (_e, d) => cb(d)
    ipcRenderer.on('downloads-updated', l)
    return () => ipcRenderer.removeListener('downloads-updated', l)
  },
  onSettings: (cb) => {
    const l = (_e, d) => cb(d)
    ipcRenderer.on('settings-updated', l)
    return () => ipcRenderer.removeListener('settings-updated', l)
  },
  })
}
