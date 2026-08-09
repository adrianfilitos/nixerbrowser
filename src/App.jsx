import { useEffect, useRef, useState } from 'react'
import TabStrip from './components/TabStrip.jsx'
import Toolbar from './components/Toolbar.jsx'
import BookmarksBar from './components/BookmarksBar.jsx'
import FindBar from './components/FindBar.jsx'
import Palette from './components/Palette.jsx'
import { Modal, ConfirmModal, BookmarkModal } from './components/Modal.jsx'
import ShieldsPopup from './components/ShieldsPopup.jsx'
import SiteInfoPopup from './components/SiteInfoPopup.jsx'
import TaskManager from './components/TaskManager.jsx'
import Toasts from './components/Toasts.jsx'
import { I } from './components/icons.jsx'

const PERM_NAMES = {
  media: 'Cámara y micrófono',
  geolocation: 'Ubicación',
  notifications: 'Notificaciones',
  'clipboard-read': 'Portapapeles',
  'display-capture': 'Captura de pantalla',
  keyboardLock: 'Teclado',
  'window-management': 'Ventanas',
  fileSystem: 'Archivos',
}

const PAGE_TITLES = {
  newtab: 'Nueva pestaña',
  history: 'Historial',
  bookmarks: 'Marcadores',
  downloads: 'Descargas',
  settings: 'Ajustes',
  ai: 'Asistente IA',
  reader: 'Modo lectura',
  welcome: 'Bienvenida',
  passwords: 'Contraseñas',
  extensions: 'Extensiones',
  about: 'Acerca de Nixer',
  warning: 'Aviso de seguridad',
  incognito: 'Incógnito',
}

let tabSeq = 1

function isLoopback(url) {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host === 'localhost' || host === '[::1]' || host === '::1' || host.startsWith('127.')
  } catch {
    return false
  }
}

export default function App() {
  const [tabs, setTabs] = useState([])
  const [navState, setNavState] = useState({ canGoBack: false, canGoForward: false, isLoading: false })
  const [settings, setSettings] = useState(null)
  const [bookmarks, setBookmarks] = useState([])
  const [bookmarked, setBookmarked] = useState(false)
  const [downloads, setDownloads] = useState([])
  const [focusSignal, setFocusSignal] = useState(0)
  const [findOpen, setFindOpen] = useState(false)
  const [findResult, setFindResult] = useState(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [modal, setModal] = useState(null)
  const [toasts, setToasts] = useState([])
  const [shieldsOrigin, setShieldsOrigin] = useState(null)
  const [shieldsAnchor, setShieldsAnchor] = useState(null)
  const [siteInfoUrl, setSiteInfoUrl] = useState(null)
  const [siteInfoAnchor, setSiteInfoAnchor] = useState(null)
  const [taskManagerOpen, setTaskManagerOpen] = useState(false)
  const [splitWith, setSplitWith] = useState(null)
  const [permission, setPermission] = useState(null)
  const [incognito, setIncognito] = useState(false)
  const [savePrompt, setSavePrompt] = useState(null)
  const [urlOverrides, setUrlOverrides] = useState({})
  const [maximized, setMaximized] = useState(false)

  const viewInfoRef = useRef({ newtab: '', welcome: '', pages: '', preload: '' })
  const incognitoRef = useRef(false)
  const settingsRef = useRef(null)
  const tabsRef = useRef([])
  const elsRef = useRef(new Map())
  const attachedRef = useRef(new WeakSet())
  const closedTabsRef = useRef([])
  const sessionTimerRef = useRef(null)
  const [ready, setReady] = useState(false)

  const activeTab = tabs.find((t) => t.active) || null
  const inProgress = downloads.filter((d) => d.state === 'in-progress').length

  function activeEl() {
    return activeTab ? elsRef.current.get(activeTab.id) : null
  }

  function refreshNavState() {
    const el = activeEl()
    if (!el) return
    let canGoBack = false
    let canGoForward = false
    let isLoading = false
    try {
      canGoBack = el.canGoBack()
      canGoForward = el.canGoForward()
      isLoading = el.isLoading()
    } catch {}
    setNavState({ canGoBack, canGoForward, isLoading })
  }

  function internalForSrc(src) {
    if (!src) return null
    const n = /^nixer:\/\/([^/]+)(?:\/([^?#]+))?/.exec(src)
    if (n) {
      const key = n[2] ? n[2].replace(/\.html$/, '') : n[1]
      if (key === 'newtab') return 'newtab'
      if (PAGE_TITLES[key]) return key
      return null
    }
    if (!src.startsWith('file://')) return null
    if (src.endsWith('newtab.html')) return 'newtab'
    for (const k of ['history', 'bookmarks', 'downloads', 'settings', 'ai', 'reader', 'welcome']) {
      if (src.endsWith('/' + k + '.html')) return k
    }
    return null
  }

  useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  function computeSrc(url) {
    if (url) return url
    if (incognitoRef.current) return 'nixer://incognito'
    if (urlOverrides.newtab) return urlOverrides.newtab
    if (settingsRef.current && settingsRef.current.profileCreated) return viewInfoRef.current.newtab
    return viewInfoRef.current.welcome
  }

  function attach(el, id) {
    if (attachedRef.current.has(el)) return
    attachedRef.current.add(el)
    const update = (patch) => setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))

    el.addEventListener('dom-ready', () => {
      try {
        const wcId = el.getWebContentsId()
        update({ wcId })
        const t = tabsRef.current.find((x) => x.id === id)
        if (t && t.active) window.api.setActiveWc(wcId)
        const z = settingsRef.current && settingsRef.current.defaultZoom
        if (z && z !== 1) el.setZoomFactor(z)
      } catch {}
    })

    el.addEventListener('did-navigate', (e) => {
      const url = e.url
      const internal = internalForSrc(url)
      update({ url: internal ? '' : url, internal })
      if (!internal && url.startsWith('http') && !isLoopback(url) && !incognitoRef.current) {
        const t = tabsRef.current.find((x) => x.id === id)
        window.api.addHistory({ url, title: (t && t.title) || url })
      }
      refreshNavState()
      scheduleSessionSave()
    })

    el.addEventListener('did-navigate-in-page', (e) => {
      const internal = internalForSrc(e.url)
      update({ url: internal ? '' : e.url, internal })
    })

    el.addEventListener('page-title-updated', (e) => {
      if (e.title) {
        update({ title: e.title })
        try {
          const u = e.url || el.getURL()
          if (u && u.startsWith('http')) window.api.updateHistoryTitle(u, e.title)
        } catch {}
      }
    })

    el.addEventListener('page-favicon-updated', (e) => {
      update({ favicon: e.favicons && e.favicons[0] ? e.favicons[0] : null })
    })

    el.addEventListener('did-start-loading', () => refreshNavState())
    el.addEventListener('did-stop-loading', () => refreshNavState())

    el.addEventListener('found-in-page', (e) => {
      setFindResult(e.result)
    })

    el.addEventListener('render-process-gone', () => {
      update({ title: 'Pestaña no disponible' })
    })
  }

  function addTab(url, opts = {}) {
    const src = opts.src || computeSrc(url)
    const id = Date.now() + '-' + tabSeq++
    const tab = {
      id,
      url: url || '',
      src,
      title: opts.title || (url ? '' : (internalForSrc(src) === 'welcome' ? 'Bienvenida' : 'Nueva pestaña')),
      favicon: null,
      pinned: !!opts.pinned,
      internal: opts.internal || internalForSrc(src),
      wcId: null,
      active: false,
      group: null,
    }
    setTabs((prev) => prev.map((t) => ({ ...t, active: false })).concat(tab))
    if (opts.activate !== false) requestAnimationFrame(() => activate(id))
    scheduleSessionSave()
    return id
  }

  function activate(id) {
    setTabs((prev) => prev.map((t) => ({ ...t, active: t.id === id })))
    requestAnimationFrame(() => {
      const el = elsRef.current.get(id)
      if (el) {
        try { window.api.setActiveWc(el.getWebContentsId()) } catch {}
      }
      refreshNavState()
    })
  }

  function switchTab(id) {
    activate(id)
  }

  function closeTab(id) {
    const idx = tabs.findIndex((t) => t.id === id)
    const t = tabs[idx]
    if (!t) return
    if (t.url && t.url.startsWith('http')) closedTabsRef.current.unshift({ url: t.url, title: t.title })
    if (closedTabsRef.current.length > 50) closedTabsRef.current.length = 50
    setTabs((prev) => {
      const next = prev.filter((x) => x.id !== id)
      if (next.length === 0) {
        if (settingsRef.current && settingsRef.current.lastTabCloseAction === 'closeWindow') {
          window.api.close()
          return prev
        }
        const fresh = createTabObject()
        return [fresh]
      }
      if (prev[idx] && prev[idx].active) {
        const nxt = next[Math.min(idx, next.length - 1)]
        return next.map((x) => ({ ...x, active: x.id === nxt.id }))
      }
      return next
    })
    scheduleSessionSave()
  }

  function closeAllTabs() {
    if (settingsRef.current && settingsRef.current.confirmCloseMultiple !== false) {
      if (!window.confirm('¿Cerrar todas las pestañas?')) return
    }
    tabs.forEach((t) => {
      if (t.url && t.url.startsWith('http')) closedTabsRef.current.unshift({ url: t.url, title: t.title })
    })
    if (closedTabsRef.current.length > 50) closedTabsRef.current.length = 50
    if (settingsRef.current && settingsRef.current.lastTabCloseAction === 'closeWindow') {
      window.api.close()
      return
    }
    setTabs([createTabObject()])
    scheduleSessionSave()
  }

  function toggleSplit(id) {
    setSplitWith((cur) => {
      if (cur) return null
      const other = id || (tabs.find((t) => !t.active) || {}).id || null
      return other
    })
  }

  function setTabGroup(id, group) {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, group } : t)))
  }

  function createTabObject() {
    const src = computeSrc('')
    const id = Date.now() + '-' + tabSeq++
    return {
      id,
      url: '',
      src,
      title: internalForSrc(src) === 'welcome' ? 'Bienvenida' : 'Nueva pestaña',
      favicon: null,
      pinned: false,
      internal: internalForSrc(src),
      wcId: null,
      active: true,
      group: null,
    }
  }

  function cycleTab(delta) {
    if (tabs.length < 2) return
    const i = tabs.findIndex((t) => t.active)
    const next = tabs[(i + delta + tabs.length) % tabs.length]
    activate(next.id)
  }

  function restoreTab() {
    const t = closedTabsRef.current.shift()
    if (t) addTab(t.url)
  }

  function navigate(url) {
    const el = activeEl()
    if (el) {
      try { el.loadURL(url) } catch {}
    }
  }

  function navAction(action) {
    const el = activeEl()
    if (!el) return
    try {
      if (action === 'goBack' && el.canGoBack()) el.goBack()
      else if (action === 'goForward' && el.canGoForward()) el.goForward()
      else if (action === 'reload') el.reload()
      else if (action === 'stop') el.stop()
    } catch {}
    refreshNavState()
  }

  function openInternal(key) {
    addTab('', { src: 'nixer://' + key, internal: key, title: PAGE_TITLES[key] || key })
  }

  function home() {
    if (settings && settings.homePage) navigate(settings.homePage)
  }

  function doFind(text, findNext) {
    const el = activeEl()
    if (!el) return
    if (!text) {
      try { el.stopFindInPage('clearSelection') } catch {}
      return
    }
    try { el.findInPage(text, { findNext: !!findNext }) } catch {}
  }

  function stopFind() {
    const el = activeEl()
    if (el) {
      try { el.stopFindInPage('clearSelection') } catch {}
    }
    setFindResult(null)
  }

  function scheduleSessionSave() {
    if (incognitoRef.current) return
    clearTimeout(sessionTimerRef.current)
    sessionTimerRef.current = setTimeout(() => {
      setTabs((prev) => {
        window.api.saveSession(prev.filter((t) => t.url && t.url.startsWith('http') && !isLoopback(t.url)).map((t) => ({ url: t.url, pinned: !!t.pinned })))
        return prev
      })
    }, 1500)
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const info = await window.api.viewInfo()
        if (cancelled) return
        viewInfoRef.current = info
        const [s, w] = await Promise.all([window.api.getSettings(), window.api.windowInfo()])
        if (cancelled) return
        settingsRef.current = s
        setSettings(s)
        incognitoRef.current = !!w.incognito
        setIncognito(!!w.incognito)
        setReady(true)
        window.api.getBookmarks().then(setBookmarks)
        window.api.getUrlOverrides().then(setUrlOverrides)
        const sess = await window.api.getSession()
        if (cancelled) return
        if (sess && sess.length && s.startupBehavior === 'restore') {
          sess.forEach((u) => addTab(u.url, { pinned: u.pinned }))
          const first = tabsRef.current[0]
          if (first) setTimeout(() => activate(first.id), 150)
        } else {
          addTab()
        }
      } catch {}
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const offs = [
      window.api.onSettings(setSettings),
      window.api.onDownloads(setDownloads),
      window.api.onMaximized(setMaximized),
      window.api.onPermissionRequest((req) => setPermission(req)),
      window.api.onSavePasswordPrompt((cred) => setSavePrompt(cred)),
      window.api.onUi((action, data) => {
        if (action === 'new-tab') addTab()
        else if (action === 'open-tab') addTab(data, { activate: !(settingsRef.current && settingsRef.current.openLinksInBackground) })
        else if (action === 'close-tab') closeTab(activeTab ? activeTab.id : null)
        else if (action === 'restore-tab') restoreTab()
        else if (action === 'cycle-tab') cycleTab(data)
        else if (action === 'open-page') openInternal(data)
        else if (action === 'open-reader') addTab('', { src: 'nixer://reader?id=' + data, internal: 'reader', title: 'Modo lectura' })
        else if (action === 'open-find') setFindOpen(true)
        else if (action === 'open-palette') setPaletteOpen(true)
        else if (action === 'focus-address') setFocusSignal((s) => s + 1)
        else if (action === 'open-taskmanager') setTaskManagerOpen(true)
        else if (action === 'home') home()
        else if (action === 'bookmark-page') onStar()
        else if (action === 'activate-tab') {
          const t = tabsRef.current.find((x) => x.wcId === Number(data))
          if (t) activate(t.id)
        }
        else if (action === 'close-tab-by-wc') {
          const t = tabsRef.current.find((x) => x.wcId === Number(data))
          if (t) closeTab(t.id)
        }
        else if (action === 'ui-toast') {
          addToast(data && data.text, data && data.kind)
        }
      }),
    ]
    return () => { offs.forEach((off) => off && off()) }
  }, [tabs, activeTab, settings])

  useEffect(() => {
    const t = tabs.find((x) => x.active)
    if (t && t.url && t.url.startsWith('http')) {
      window.api.isBookmarked(t.url).then(setBookmarked)
    } else {
      setBookmarked(false)
    }
  }, [tabs])

  useEffect(() => {
    const apply = () => {
      const s = settings || {}
      const theme = s.theme || 'dark'
      const resolved = theme === 'system'
        ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
        : theme
      const root = document.documentElement
      root.dataset.theme = resolved
      const accent = s.accentColor || '#6c7bff'
      root.style.setProperty('--accent', accent)
      root.style.setProperty('--accent-2', accent)
      root.classList.toggle('compact', !!s.compact)
      root.classList.toggle('reduce-motion', s.reduceMotion === true || s.animations === false)
      root.classList.toggle('high-contrast', !!s.highContrast)
      root.classList.toggle('tabs-bottom', s.tabStripPosition === 'bottom')
      root.classList.toggle('tabs-square', s.tabShape === 'square')
      root.style.setProperty('--ui-font-scale', (s.uiFontScale || 100) / 100)
      root.style.setProperty('--toolbar-font-size', (s.toolbarFontSize || 13) + 'px')
      root.style.setProperty('--tab-min-width', (s.tabMinWidth || 120) + 'px')
      if (s.uiBackground) root.style.setProperty('--bg0', s.uiBackground)
      else root.style.removeProperty('--bg0')
    }
    apply()
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    if (settings && settings.theme === 'system') mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [settings])

  function refreshBookmarks() {
    window.api.getBookmarks().then(setBookmarks)
  }

  function addToast(msg, kind) {
    const id = Date.now() + '-' + Math.random().toString(16).slice(2)
    setToasts((t) => [...t, { id, msg, kind: kind || 'info' }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800)
  }

  function onStar() {
    if (!activeTab || !activeTab.url) return
    if (bookmarked) {
      const bm = bookmarks.find((b) => b.url === activeTab.url)
      if (bm) {
        window.api.removeBookmark(bm.id).then(() => {
          refreshBookmarks()
          setBookmarked(false)
          addToast('Marcador eliminado', 'info')
        })
      }
    } else {
      setModal({ type: 'bookmark', url: activeTab.url, title: activeTab.title })
    }
  }

  function saveBookmark(title) {
    const m = modal
    window.api.addBookmark({ url: m.url, title }).then(() => {
      refreshBookmarks()
      setBookmarked(true)
      setModal(null)
      addToast('Marcador añadido', 'ok')
    })
  }

  function confirmRemoveBookmark(id, title) {
    setModal({
      type: 'confirm',
      title: 'Quitar marcador',
      message: '¿Quitar "' + (title || '') + '" de los marcadores?',
      confirmLabel: 'Quitar',
      danger: true,
      onConfirm: () => {
        window.api.removeBookmark(id).then(() => {
          refreshBookmarks()
          setModal(null)
          addToast('Marcador eliminado', 'info')
        })
      },
    })
  }

  function toggleTheme() {
    const cur = (settings && settings.theme) || 'dark'
    const next = cur === 'light' ? 'dark' : 'light'
    window.api.setSetting({ theme: next }).then(() => addToast('Tema: ' + (next === 'light' ? 'claro' : 'oscuro'), 'info'))
  }

  function handleDblClick(e) {
    if (e.target.closest('button, input, webview, .tab, .address-bar, .bm-item, .win-controls')) return
    window.api.toggleMaximize()
  }

  const actions = {
    newTab: () => addTab(),
    newWindow: () => window.api.createWindow && window.api.createWindow(false),
    private: () => window.api.createWindow && window.api.createWindow(true),
    closeTab: () => closeTab(activeTab ? activeTab.id : null),
    restore: () => restoreTab(),
    reload: () => navAction('reload'),
    back: () => navAction('goBack'),
    forward: () => navAction('goForward'),
    history: () => openInternal('history'),
    downloads: () => openInternal('downloads'),
    bookmarks: () => openInternal('bookmarks'),
    settings: () => openInternal('settings'),
    ai: () => openInternal('ai'),
    find: () => setFindOpen(true),
    fullscreen: () => window.api.toggleFullscreen(),
    theme: toggleTheme,
  }

  const paletteItems = [
    { icon: I.plus, label: 'Nueva pestaña', accel: 'Ctrl+T', action: actions.newTab },
    { icon: I.window, label: 'Nueva ventana', accel: 'Ctrl+N', action: actions.newWindow },
    { icon: I.incognito, label: 'Ventana de incógnito', accel: 'Ctrl+Shift+N', action: actions.private },
    { sep: true },
    { icon: I.history, label: 'Historial', accel: 'Ctrl+H', action: actions.history },
    { icon: I.downloads, label: 'Descargas', accel: 'Ctrl+J', action: actions.downloads },
    { icon: I.star, label: 'Marcadores', accel: 'Ctrl+Shift+O', action: actions.bookmarks },
    { icon: I.settings, label: 'Ajustes', accel: 'Ctrl+,', action: actions.settings },
    { icon: I.ai, label: 'Asistente IA', accel: 'Ctrl+Alt+A', action: actions.ai },
    { icon: I.key, label: 'Contraseñas', action: () => openInternal('passwords') },
    { icon: I.puzzle, label: 'Extensiones', action: () => openInternal('extensions') },
    { icon: I.form, label: 'Autocompletar formulario', action: () => window.api.autofillForm() },
    { sep: true },
    { icon: I.find, label: 'Buscar en página', accel: 'Ctrl+F', action: actions.find },
    { icon: I.gauge, label: 'Administrador de tareas', accel: 'Shift+Esc', action: () => setTaskManagerOpen(true) },
    { icon: I.reader, label: 'Modo lectura', accel: 'Ctrl+Shift+M', action: () => window.api.readerMode().then((id) => id && addTab('', { src: 'nixer://reader?id=' + id, internal: 'reader', title: 'Modo lectura' })) },
    { icon: I.save, label: 'Guardar página como…', accel: 'Ctrl+S', action: () => window.api.savePage() },
    { icon: I.print, label: 'Imprimir', accel: 'Ctrl+P', action: () => window.api.print() },
    { icon: I.sun, label: 'Cambiar tema', action: actions.theme },
    { icon: I.back, label: 'Atrás', accel: 'Alt+Izq', action: actions.back },
    { icon: I.forward, label: 'Adelante', accel: 'Alt+Der', action: actions.forward },
    { icon: I.reload, label: 'Recargar', accel: 'Ctrl+R', action: actions.reload },
    { icon: I.restore, label: 'Reabrir pestaña cerrada', accel: 'Ctrl+Shift+T', action: actions.restore },
    { sep: true },
    ...tabs
      .filter((t) => t.url || t.title)
      .map((t) => ({
        icon: t.favicon ? <img className="pal-fav" src={t.favicon} alt="" /> : I.globe,
        label: t.title || 'Nueva pestaña',
        meta: t.url,
        action: () => switchTab(t.id),
      })),
  ]

  return (
    <div className="app" onDoubleClick={handleDblClick}>
      <div className="chrome">
        <TabStrip
          tabs={tabs}
          onNew={() => addTab()}
          onSelect={switchTab}
          onClose={closeTab}
          onCloseAll={closeAllTabs}
          onGroup={setTabGroup}
          splitWith={splitWith}
          onSplit={toggleSplit}
          onPin={(id) => setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, pinned: !t.pinned } : t)))}
          onNewUrl={(url) => addTab(url)}
          onRestore={() => restoreTab()}
          onReorder={(fromId, toId) => {
            setTabs((prev) => {
              const next = [...prev]
              const i = next.findIndex((t) => String(t.id) === String(fromId))
              const j = next.findIndex((t) => String(t.id) === String(toId))
              if (i < 0 || j < 0) return prev
              const [m] = next.splice(i, 1)
              next.splice(j, 0, m)
              return next
            })
          }}
          maximized={maximized}
        />
        {settings && settings.showBookmarksBar && (
          <BookmarksBar
            bookmarks={bookmarks}
            onNavigate={navigate}
            onRemove={confirmRemoveBookmark}
            onNewUrl={(url) => addTab(url)}
          />
        )}
        <Toolbar
          navState={navState}
          activeTab={activeTab}
          focusSignal={focusSignal}
          bookmarked={bookmarked}
          inProgressCount={inProgress}
          onNavigate={navigate}
          onNavAction={navAction}
          onToggleBookmark={onStar}
          onOpenPage={openInternal}
          onOpenPalette={() => setPaletteOpen(true)}
          onShields={(btn) => {
            if (!(activeTab && activeTab.url && activeTab.url.startsWith('http'))) return
            setShieldsAnchor(btn ? btn.getBoundingClientRect() : null)
            setShieldsOrigin(activeTab.url)
          }}
          onSiteInfo={(btn) => {
            if (!(activeTab && activeTab.url)) return
            setSiteInfoAnchor(btn ? btn.getBoundingClientRect() : null)
            setSiteInfoUrl(activeTab.url)
          }}
          profileName={settings ? settings.profileName : ''}
          profileColor={settings ? settings.profileColor : ''}
          incognito={incognito}
          settings={settings}
          onNewTab={() => addTab()}
        />
      </div>

      <div className={'page-container' + (splitWith ? ' splitscreen' : '')}>
        {ready && tabs.map((t) => (
          <webview
            key={t.id}
            ref={(el) => {
              if (el) {
                elsRef.current.set(t.id, el)
                attach(el, t.id)
              }
            }}
            src={t.src}
            partition={incognitoRef.current ? 'navegador-incognito' : undefined}
            preload={viewInfoRef.current.preload || undefined}
            className={'page-view' + (t.active ? ' active' : '') + (splitWith === t.id ? ' split-on' : '')}
          />
        ))}
        {splitWith && (
          <button className="split-exit" title="Salir de la vista dividida" onClick={() => setSplitWith(null)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        )}
      </div>

      {shieldsOrigin && <ShieldsPopup origin={shieldsOrigin} anchor={shieldsAnchor} onClose={() => { setShieldsOrigin(null); setShieldsAnchor(null) }} />}
      {siteInfoUrl && <SiteInfoPopup url={siteInfoUrl} anchor={siteInfoAnchor} onClose={() => { setSiteInfoUrl(null); setSiteInfoAnchor(null) }} />}
      {taskManagerOpen && <TaskManager onClose={() => setTaskManagerOpen(false)} onKill={(wcId) => closeTabByWc(wcId)} />}
      {permission && (
        <PermissionModal
          request={permission}
          onClose={() => { window.api.permissionResponse({ id: permission.id, allow: false, remember: false }); setPermission(null) }}
        />
      )}
      {savePrompt && (
        <Modal
          title="Guardar contraseña"
          onClose={() => setSavePrompt(null)}
          footer={
            <>
              <button className="btn" onClick={() => setSavePrompt(null)}>Ahora no</button>
              <button className="btn primary" onClick={() => { window.api.savePassword(savePrompt); setSavePrompt(null); addToast('Contraseña guardada', 'ok') }}>Guardar</button>
            </>
          }
        >
          <p className="modal-msg">¿Guardar la contraseña de <b>{savePrompt.origin}</b>?</p>
          <div className="modal-url">Usuario: {savePrompt.username}</div>
        </Modal>
      )}
      {findOpen && <FindBar result={findResult} onFind={doFind} onStop={stopFind} onClose={() => { stopFind(); setFindOpen(false) }} />}
      <Palette open={paletteOpen} items={paletteItems} onClose={() => setPaletteOpen(false)} />
      {modal && modal.type === 'bookmark' && (
        <BookmarkModal
          url={modal.url}
          initialTitle={modal.title}
          onSave={saveBookmark}
          onCancel={() => setModal(null)}
        />
      )}
      {modal && modal.type === 'confirm' && (
        <ConfirmModal
          title={modal.title}
          message={modal.message}
          confirmLabel={modal.confirmLabel}
          danger={modal.danger}
          onConfirm={modal.onConfirm}
          onCancel={() => setModal(null)}
        />
      )}
      <Toasts toasts={toasts} />
    </div>
  )

  function closeTabByWc(wcId) {
    const t = tabs.find((x) => x.wcId === Number(wcId))
    if (t) closeTab(t.id)
  }
}

function PermissionModal({ request, onClose }) {
  const [remember, setRemember] = useState(false)
  function respond(allow) {
    window.api.permissionResponse({ id: request.id, allow, remember })
    onClose()
  }
  return (
    <Modal
      title="Permiso solicitado"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={() => respond(false)}>Bloquear</button>
          <button className="btn primary" onClick={() => respond(true)}>Permitir</button>
        </>
      }
    >
      <p className="modal-msg">
        <b>{request.origin}</b> quiere usar: <b>{PERM_NAMES[request.permission] || request.permission}</b>
      </p>
      <label className="perm-remember">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Recordar mi decisión para este sitio
      </label>
    </Modal>
  )
}
