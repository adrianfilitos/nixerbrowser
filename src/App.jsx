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
import Sidebar from './components/Sidebar.jsx'
import GamepadHud from './components/GamepadHud.jsx'
import { useGamepad, rumble } from './components/useGamepad.js'
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
  credits: 'Créditos',
  profiles: 'Perfiles',
  readinglist: 'Lista de lectura',
  workspaces: 'Espacios de trabajo',
  warning: 'Aviso de seguridad',
  incognito: 'Incógnito',
  error: 'Error de conexión',
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

function copyText(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).catch(() => {})
  } else {
    const ta = document.createElement('textarea')
    ta.value = t
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch {}
    document.body.removeChild(ta)
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
  const [closedCount, setClosedCount] = useState(0)
  const [statusUrl, setStatusUrl] = useState('')
  const [sidebar, setSidebar] = useState(null)
  const [presentation, setPresentation] = useState(false)
  const [tabSearchOpen, setTabSearchOpen] = useState(false)
  const [tabSearchQuery, setTabSearchQuery] = useState('')
  const windowIdRef = useRef(0)
  const cursorRef = useRef({ x: 0, y: 0, visible: false })
  const dragRef = useRef(false)
  const oskOpenRef = useRef(false)
  const autoFsRef = useRef(false)
  const tvIdleTimerRef = useRef(null)
  const [gpConnected, setGpConnected] = useState(false)
  const [gpName, setGpName] = useState('')
  const [hintMode, setHintMode] = useState(false)
  const [hints, setHints] = useState([])
  const [hintSel, setHintSel] = useState(0)
  const [hudOpen, setHudOpen] = useState(false)
  const [tvIdle, setTvIdle] = useState(false)

  function toggleSidebar(tab) {
    setSidebar((cur) => (cur === tab ? null : (tab || 'bookmarks')))
  }
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
  const failedUrlRef = useRef(new Map())
  const sessionTimerRef = useRef(null)
  const [ready, setReady] = useState(false)

  const activeTab = tabs.find((t) => t.active) || null
  const inProgress = downloads.filter((d) => d.state === 'in-progress').length
  const tvMode = !!(settings && settings.tvMode)

  function activeEl() {
    return activeTab ? elsRef.current.get(activeTab.id) : null
  }

  function handleWheel(e) {
    if (!e.ctrlKey) return
    e.preventDefault()
    const el = activeEl()
    if (!el) return
    try {
      const z = el.getZoomFactor() || 1
      el.setZoomFactor(Math.min(3, Math.max(0.25, z + (e.deltaY < 0 ? 0.1 : -0.1))))
    } catch {}
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
    const n = /^nixer:\/\/([^/?#]+)(?:\/([^?#]+))?/.exec(src)
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

  function errorPageOriginal(url) {
    try {
      return decodeURIComponent(new URL(url).searchParams.get('url') || '')
    } catch {
      return ''
    }
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
      if (internal === 'error') {
        update({ url: failedUrlRef.current.get(id) || errorPageOriginal(url), internal: 'error', title: 'No se puede acceder a este sitio' })
        return
      }
      update({ url: internal ? '' : url, internal, error: null })
      failedUrlRef.current.delete(id)
      if (!internal && url.startsWith('http') && !isLoopback(url) && !incognitoRef.current) {
        const t = tabsRef.current.find((x) => x.id === id)
        window.api.addHistory({ url, title: (t && t.title) || url })
      }
      refreshNavState()
      scheduleSessionSave()
    })

    el.addEventListener('did-fail-load', (e) => {
      if (!e.isMainFrame) return
      const code = e.errorCode
      if (code === -3 || code === -320) return
      const url = e.validatedURL || ''
      if (!url) return
      failedUrlRef.current.set(id, url)
      update({ url, error: { code, desc: e.errorDescription || '', url }, title: 'No se puede acceder a este sitio' })
      try {
        el.loadURL('nixer://error?url=' + encodeURIComponent(url) + '&code=' + code + '&desc=' + encodeURIComponent(e.errorDescription || ''))
      } catch {}
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

    el.addEventListener('media-started-playing', () => { update({ audible: true }) })
    el.addEventListener('media-paused', () => { update({ audible: false }) })
    try { el.setAudioMuted(!!(tabsRef.current.find((x) => x.id === id) || {}).muted) } catch {}

    el.addEventListener('did-start-loading', () => refreshNavState())
    el.addEventListener('did-stop-loading', () => refreshNavState())

    el.addEventListener('found-in-page', (e) => {
      setFindResult(e.result)
    })

    el.addEventListener('render-process-gone', () => {
      update({ title: 'Pestaña no disponible' })
    })
  }

  function newTabRecord({ url = '', src, internal, title, pinned = false, group = null, active = false } = {}) {
    const finalSrc = src || computeSrc(url)
    return {
      id: Date.now() + '-' + tabSeq++,
      url,
      src: finalSrc,
      title: title || (url ? '' : (internalForSrc(finalSrc) === 'welcome' ? 'Bienvenida' : 'Nueva pestaña')),
      favicon: null,
      pinned,
      internal: internal || internalForSrc(finalSrc),
      wcId: null,
      active,
      group,
      audible: false,
      muted: false,
    }
  }

  function addTab(url, opts = {}) {
    const tab = newTabRecord({ url, src: opts.src, internal: opts.internal, title: opts.title, pinned: opts.pinned, group: opts.group })
    setTabs((prev) => prev.map((t) => ({ ...t, active: false })).concat(tab))
    if (opts.activate !== false) {
      requestAnimationFrame(() => activate(tab.id))
      if (!url) setFocusSignal((s) => s + 1)
    }
    scheduleSessionSave()
    return tab.id
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
    setClosedCount(closedTabsRef.current.length)
    failedUrlRef.current.delete(id)
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
    setClosedCount(closedTabsRef.current.length)
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
    setTabs((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, group } : t))
      const groups = {}
      next.forEach((t) => { if (t.group) groups[t.group.id] = t.group })
      try { window.api.groups.set(groups) } catch {}
      return next
    })
  }

  function renameTab(id, title) {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, title } : t)))
  }

  function moveTab(id, dir) {
    setTabs((prev) => {
      const next = [...prev]
      const i = next.findIndex((t) => t.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= next.length) return prev
      const tmp = next[i]
      next[i] = next[j]
      next[j] = tmp
      return next
    })
  }

  function closeTabsLeft(id) {
    const idx = tabs.findIndex((t) => t.id === id)
    tabs.forEach((t, i) => { if (i < idx) closeTab(t.id) })
  }

  function muteTab(id) {
    const t = tabs.find((x) => x.id === id)
    if (!t) return
    const next = !t.muted
    setTabs((prev) => prev.map((x) => (x.id === id ? { ...x, muted: next } : x)))
    const el = elsRef.current.get(id)
    if (el) {
      try { el.setAudioMuted(next) } catch {}
    }
  }

  function moveTabToWindow(id) {
    const t = tabs.find((x) => x.id === id)
    if (!t || !t.url) return
    window.api.createWindow(false, t.url)
    closeTab(id)
  }

  function openInNewWindow(url) {
    if (url) window.api.createWindow(false, url)
  }

  function openExternal(url) {
    const t = tabs.find((x) => x.active)
    if (t && t.internal && !t.url && !t.pinned) {
      const el = elsRef.current.get(t.id)
      if (el) { try { el.loadURL(url) } catch {} }
      return
    }
    addTab(url, { activate: !(settingsRef.current && settingsRef.current.openLinksInBackground) })
  }

  function navigateTab(id, url) {
    const el = elsRef.current.get(id)
    if (el && url) {
      try { el.loadURL(url) } catch {}
    }
  }

  function restoreAllTabs() {
    while (closedTabsRef.current.length) {
      const t = closedTabsRef.current.shift()
      if (t) addTab(t.url, { activate: false })
    }
    setClosedCount(0)
  }

  function reloadAllTabs() {
    setTabs((prev) => {
      prev.forEach((t) => {
        const el = elsRef.current.get(t.id)
        if (!el) return
        try {
          if (t.error && t.error.url) el.loadURL(t.error.url)
          else el.reload()
        } catch {}
      })
      return prev
    })
  }

  function bookmarkAllTabs() {
    let n = 0
    tabs.forEach((t) => {
      if (t.url && t.url.startsWith('http')) {
        window.api.addBookmark({ url: t.url, title: t.title || t.url })
        n++
      }
    })
    refreshBookmarks()
    addToast(n + ' pestañas añadidas a marcadores', 'ok')
  }

  function createTabObject() {
    return newTabRecord({ active: true })
  }

  function cycleTab(delta) {
    if (tabs.length < 2) return
    const i = tabs.findIndex((t) => t.active)
    const next = tabs[(i + delta + tabs.length) % tabs.length]
    activate(next.id)
  }

  function restoreTab() {
    const t = closedTabsRef.current.shift()
    setClosedCount(closedTabsRef.current.length)
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
      else if (action === 'reload') {
        const t = activeTab
        if (t && t.error && t.error.url) try { el.loadURL(t.error.url) } catch {}
        else el.reload()
      }
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
        window.api.saveSession(prev.filter((t) => t.url && t.url.startsWith('http') && !isLoopback(t.url)).map((t) => ({ url: t.url, pinned: !!t.pinned, group: t.group ? t.group.id : undefined })))
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
        windowIdRef.current = w.id || 0
        setReady(true)
        window.api.getBookmarks().then(setBookmarks)
        window.api.getUrlOverrides().then(setUrlOverrides)
        const sess = await window.api.getSession()
        if (cancelled) return
        if (sess && sess.length && s.startupBehavior === 'restore') {
          const groups = (await window.api.groups.get().catch(() => ({}))) || {}
          sess.forEach((u) => addTab(u.url, { pinned: u.pinned, group: u.group ? groups[u.group] : undefined }))
          const first = tabsRef.current[0]
          if (first) setTimeout(() => activate(first.id), 150)
        } else {
          addTab()
        }
      } catch {}
    })()
    try {
      if (!localStorage.getItem('nixer-drag-hint-v2')) {
        setTimeout(() => addToast('Consejo: pulsa y arrastra una pestaña para reordenarla · suéltala fuera para abrirla en una ventana nueva', 'info'), 1200)
      }
    } catch {}
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
        else if (action === 'open-tab') openExternal(data)
        else if (action === 'open-tab-bg') addTab(data, { activate: false })
        else if (action === 'close-tab') closeTab(activeTab ? activeTab.id : null)
        else if (action === 'restore-tab') restoreTab()
        else if (action === 'cycle-tab') cycleTab(data)
        else if (action === 'open-page') openInternal(data)
        else if (action === 'open-reader') addTab('', { src: 'nixer://reader?id=' + data, internal: 'reader', title: 'Modo lectura' })
        else if (action === 'open-find') setFindOpen(true)
        else if (action === 'open-palette') setPaletteOpen(true)
        else if (action === 'focus-address') setFocusSignal((s) => s + 1)
        else if (action === 'drag-highlight') window.dispatchEvent(new CustomEvent('nixer-drag-highlight', { detail: !!data }))
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
        else if (action === 'copy-url') {
          const t = tabsRef.current.find((x) => x.active)
          const url = (t && (t.url || (t.internal ? 'nixer://' + t.internal : ''))) || ''
          if (url) copyText(url)
        }
        else if (action === 'view-source') {
          const t = tabsRef.current.find((x) => x.active)
          if (t && t.url && /^https?:/.test(t.url)) addTab('view-source:' + t.url)
        }
        else if (action === 'goto-tab') {
          const list = tabsRef.current
          const idx = list.length > 0 && Number(data) >= 9 ? list.length - 1 : Number(data)
          const t = list[idx]
          if (t) activate(t.id)
        }
        else if (action === 'toggle-mute') {
          const el = elsRef.current.get(activeTab && activeTab.id)
          if (el) {
            try { el.setAudioMuted(el.isAudioMuted ? !el.isAudioMuted() : true) } catch {}
          }
        }
        else if (action === 'bookmark-all') {
          bookmarkAllTabs()
        }
        else if (action === 'copy-title') {
          const t = tabsRef.current.find((x) => x.active)
          if (t && t.title) copyText(t.title)
        }
        else if (action === 'copy-markdown') {
          const t = tabsRef.current.find((x) => x.active)
          if (t) copyText('[' + (t.title || t.url || '') + '](' + (t.url || '') + ')')
        }
        else if (action === 'move-tab') {
          const t = activeTab
          if (t) moveTab(t.id, Number(data))
        }
        else if (action === 'close-tab-by-id') {
          closeTab(String(data))
        }
        else if (action === 'translate-page') {
          const t = tabsRef.current.find((x) => x.active)
          if (t && t.url && /^https?:/.test(t.url)) {
            addTab('https://translate.google.com/translate?sl=auto&tl=es&u=' + encodeURIComponent(t.url))
          }
        }
        else if (action === 'install-site') {
          const t = tabsRef.current.find((x) => x.active)
          if (t && t.url && /^https?:/.test(t.url)) {
            window.api.installSite(t.url, t.title).then((ok) => addToast(ok ? 'Acceso directo creado en el escritorio' : 'No se pudo crear', ok ? 'ok' : 'info'))
          }
        }
        else if (action === 'status-url') {
          setStatusUrl(data || '')
        }
        else if (action === 'toggle-sidebar') {
          toggleSidebar(sidebar ? null : 'bookmarks')
        }
        else if (action === 'toggle-presentation') {
          setPresentation((p) => !p)
        }
        else if (action === 'open-tab-search') {
          setTabSearchQuery('')
          setTabSearchOpen(true)
        }
        else if (action === 'save-workspace') {
          const name = window.prompt('Nombre del espacio de trabajo:', '')
          if (!name || !name.trim()) return
          const list = tabsRef.current.filter((t) => t.url && t.url.startsWith('http')).map((t) => ({ url: t.url, title: t.title, pinned: !!t.pinned, group: t.group ? t.group.id : undefined }))
          window.api.workspaces.save(name.trim(), list).then(() => addToast('Espacio guardado: ' + name.trim(), 'ok'))
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
      const PALETTES = ['ocean', 'forest', 'grape', 'rose', 'sepia']
      root.dataset.theme = PALETTES.includes(theme) ? theme : resolved
      const accent = s.accentColor || '#6c7bff'
      root.style.setProperty('--accent', accent)
      root.style.setProperty('--accent-2', accent)
      root.classList.toggle('compact', !!s.compact)
      root.classList.toggle('reduce-motion', s.reduceMotion === true || s.animations === false)
      root.classList.toggle('high-contrast', !!s.highContrast)
      root.classList.toggle('tv-mode', !!s.tvMode)
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

  useGamepad({
    enabled: !!settings && !!settings.tvMode,
    onEvent: handleGamepadEvent,
    onConnect: handleGpConnect,
    onDisconnect: handleGpDisconnect,
    onNonStandard: () => addToast('Mando en modo DirectInput: los botones pueden estar cambiados. Pulsa el botón de modo del mando (Home/Mode) para activar XInput', 'info'),
    onActivity: pokeActivity,
    cursorRef,
  })

  useEffect(() => {
    return window.api.onOskStatus((open) => {
      oskOpenRef.current = !!open
    })
  }, [])

  useEffect(() => {
    if (settings && settings.tvMode && gpConnected && settings.tvAutoFullscreen && !document.fullscreenElement && !autoFsRef.current) {
      window.api.toggleFullscreen()
      autoFsRef.current = true
    }
  }, [settings ? settings.tvMode : false, gpConnected])

  useEffect(() => {
    if (!settings || !settings.tvMode) {
      setTvIdle(false)
      if (autoFsRef.current && document.fullscreenElement) {
        autoFsRef.current = false
        window.api.toggleFullscreen()
      }
      return
    }
    const wake = () => pokeActivity()
    window.addEventListener('mousemove', wake)
    window.addEventListener('keydown', wake)
    window.addEventListener('wheel', wake)
    document.addEventListener('focusin', onTvFocusIn, true)
    document.addEventListener('focusout', onTvFocusOut, true)
    return () => {
      window.removeEventListener('mousemove', wake)
      window.removeEventListener('keydown', wake)
      window.removeEventListener('wheel', wake)
      document.removeEventListener('focusin', onTvFocusIn, true)
      document.removeEventListener('focusout', onTvFocusOut, true)
      clearTimeout(tvIdleTimerRef.current)
    }
  }, [settings ? settings.tvMode : false])

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

  const HINT_COLLECT = `(() => {
    const els = Array.from(document.querySelectorAll('a[href], button, input, textarea, [role="button"]'))
    const vw = window.innerWidth, vh = window.innerHeight
    const out = []
    for (const el of els) {
      const r = el.getBoundingClientRect()
      if (r.width < 4 || r.height < 4) continue
      if (r.top > vh || r.bottom < 0 || r.left > vw || r.right < 0) continue
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue
      out.push({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
    }
    return out
  })()`

  const MEDIA_KEYS = { mediaPlayPause: ' ', mediaSeekBack: 'j', mediaSeekFwd: 'l', mediaVolUp: 'ArrowUp', mediaVolDown: 'ArrowDown' }

  function pointerTarget(x, y) {
    const el = activeEl()
    if (el) {
      try {
        const r = el.getBoundingClientRect()
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          return { target: 'webview', el, x: x - r.left, y: y - r.top }
        }
      } catch {}
    }
    return { target: 'chrome' }
  }

  function sendWebMouse(el, x, y, action, opts) {
    opts = opts || {}
    const pt = { x: Math.round(x), y: Math.round(y) }
    try {
      if (action === 'move') el.sendInputEvent({ type: 'mouseMove', ...pt, movementX: 0, movementY: 0, button: opts.button || 'left', buttons: opts.buttons || 0 })
      else if (action === 'down') el.sendInputEvent({ type: 'mouseDown', ...pt, button: opts.button || 'left', clickCount: opts.count || 1 })
      else if (action === 'up') el.sendInputEvent({ type: 'mouseUp', ...pt, button: opts.button || 'left', clickCount: opts.count || 1 })
    } catch {}
  }

  function sendChromeMouse(type, x, y, opts) {
    opts = opts || {}
    try {
      window.api.uiPointer({
        type,
        x: Math.round(x),
        y: Math.round(y),
        button: opts.button === 'right' ? 'right' : 'left',
        count: opts.count || 1,
        buttons: opts.buttons || 0,
        deltaX: opts.deltaX || 0,
        deltaY: opts.deltaY || 0,
      })
    } catch {}
  }

  function doPointerClick(x, y, button, count) {
    const t = pointerTarget(x, y)
    if (t.target === 'webview') {
      sendWebMouse(t.el, t.x, t.y, 'down', { button, count })
      sendWebMouse(t.el, t.x, t.y, 'up', { button, count })
    } else {
      if (count > 1) {
        sendChromeMouse('down', x, y, { button })
        sendChromeMouse('up', x, y, { button })
      }
      sendChromeMouse('down', x, y, { button, count })
      sendChromeMouse('up', x, y, { button, count })
    }
  }

  function doScroll(dx, dy) {
    const c = cursorRef.current
    if (!c) return
    const t = pointerTarget(c.x, c.y)
    if (t.target === 'webview') {
      try {
        t.el.sendInputEvent({ type: 'mouseWheel', x: Math.round(t.x), y: Math.round(t.y), deltaX: Math.round(dx), deltaY: Math.round(dy) })
      } catch {}
    } else {
      sendChromeMouse('wheel', c.x, c.y, { deltaX: dx, deltaY: dy })
    }
  }

  function dragMove(x, y, down) {
    const t = pointerTarget(x, y)
    if (t.target === 'webview') {
      if (down) sendWebMouse(t.el, t.x, t.y, 'down', { button: 'left', count: 1 })
      else sendWebMouse(t.el, t.x, t.y, 'up', { button: 'left', count: 1 })
    } else {
      if (down) sendChromeMouse('down', x, y, { button: 'left' })
      else sendChromeMouse('up', x, y, { button: 'left' })
    }
  }

  function sendKey(code) {
    const el = activeEl()
    if (!el) return
    try {
      el.sendInputEvent({ type: 'keyDown', keyCode: code })
      el.sendInputEvent({ type: 'keyUp', keyCode: code })
    } catch {}
  }

  function synthKey(key) {
    const el = document.activeElement
    if (!el) return
    try {
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    } catch {}
  }

  function zoomStep(dir) {
    const el = activeEl()
    if (!el) return
    try {
      const z = el.getZoomFactor ? el.getZoomFactor() : 1
      el.setZoomFactor(Math.min(3, Math.max(0.25, (z || 1) + dir * 0.1)))
    } catch {}
  }

  function tabStep(dir) {
    const list = tabsRef.current
    if (!list.length) return
    const idx = list.findIndex((t) => t.active)
    const t = list[(idx + dir + list.length) % list.length]
    if (t) activate(t.id)
  }

  function toggleOsk(open) {
    if (open) {
      if (!oskOpenRef.current) {
        oskOpenRef.current = true
        window.api.oskOpen().then((res) => {
          if (res && !res.ok) {
            oskOpenRef.current = false
            addToast('No se pudo abrir el teclado virtual' + (res.reason === 'missing' ? ': osk.exe no existe' : ''), 'info')
          }
        }).catch(() => { oskOpenRef.current = false })
      }
    } else if (oskOpenRef.current) {
      oskOpenRef.current = false
      window.api.oskClose()
    }
  }

  function onTvFocusIn(e) {
    const t = e.target
    if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA' && !t.isContentEditable)) return
    oskOpenRef.current = true
    window.api.tvInputFocus()
  }

  function onTvFocusOut(e) {
    const t = e.target
    if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA' && !t.isContentEditable)) return
    oskOpenRef.current = false
    window.api.tvInputBlur()
  }

  function hintLabels(n) {
    const letters = 'abcdefghijklmnopqrstuvwxyz'
    const labels = []
    for (let i = 0; i < n; i++) {
      let s = ''
      let v = i
      do { s = letters[v % 26] + s; v = Math.floor(v / 26) - 1 } while (v >= 0)
      labels.push(s)
    }
    return labels
  }

  function enterHints() {
    const el = activeEl()
    if (!el) return
    el.executeJavaScript(HINT_COLLECT)
      .then((points) => {
        if (!Array.isArray(points) || !points.length) { addToast('No hay enlaces visibles', 'info'); return }
        const r = el.getBoundingClientRect()
        const labels = hintLabels(points.length)
        setHints(points.map((p, i) => ({ label: labels[i], x: r.left + p.x, y: r.top + p.y, xv: p.x, yv: p.y })))
        setHintSel(0)
        setHintMode(true)
        rumble(40, 0.3, 0.3)
      })
      .catch(() => {})
  }

  function exitHints() {
    setHintMode(false)
    setHints([])
  }

  function cycleHint(dir) {
    setHintSel((s) => (s + dir + hints.length) % hints.length)
  }

  function activateHint() {
    const el = activeEl()
    const h = hints[hintSel]
    if (!el || !h) { exitHints(); return }
    sendWebMouse(el, h.xv, h.yv, 'down', { button: 'left', count: 1 })
    sendWebMouse(el, h.xv, h.yv, 'up', { button: 'left', count: 1 })
    rumble(30, 0.3, 0.3)
    exitHints()
  }

  function handleGamepadEvent(ev) {
    const c = cursorRef.current
    if (!c) return
    switch (ev.type) {
      case 'pointer': {
        if (dragRef.current) {
          const t = pointerTarget(ev.x, ev.y)
          if (t.target === 'webview') sendWebMouse(t.el, t.x, t.y, 'move', { buttons: 1 })
          else sendChromeMouse('move', ev.x, ev.y, { buttons: 1 })
        } else if (tvMode) {
          const t = pointerTarget(ev.x, ev.y)
          if (t.target === 'webview') sendWebMouse(t.el, t.x, t.y, 'move', { buttons: 0 })
          else sendChromeMouse('move', ev.x, ev.y, { buttons: 0 })
        }
        break
      }
      case 'scroll':
        doScroll(ev.dx, ev.dy)
        break
      case 'drag':
        dragRef.current = ev.down
        dragMove(ev.x, ev.y, ev.down)
        break
      case 'action':
        runGamepadAction(ev.name)
        break
    }
  }

  function runGamepadAction(name) {
    const c = cursorRef.current
    switch (name) {
      case 'confirm': {
        if (paletteOpen) { synthKey('Enter'); return }
        if (hintMode) { activateHint(); return }
        doPointerClick(c.x, c.y, 'left', 1)
        rumble(25, 0.3, 0.3)
        return
      }
      case 'cancel': {
        if (hintMode) { exitHints(); return }
        if (paletteOpen) { setPaletteOpen(false); return }
        doPointerClick(c.x, c.y, 'right', 1)
        return
      }
      case 'double': {
        if (hintMode) return
        doPointerClick(c.x, c.y, 'left', 2)
        rumble(25, 0.3, 0.3)
        return
      }
      case 'tabNext': tabStep(1); rumble(25, 0.3, 0.3); return
      case 'tabPrev': tabStep(-1); rumble(25, 0.3, 0.3); return
      case 'tabNew': addTab(); rumble(40, 0.4, 0.4); return
      case 'tabClose': if (activeTab) closeTab(activeTab.id); rumble(40, 0.4, 0.4); return
      case 'navBack': navAction('goBack'); return
      case 'navForward': navAction('goForward'); return
      case 'up':
      case 'down': {
        if (hintMode) { cycleHint(name === 'down' ? 1 : -1); return }
        if (paletteOpen) { synthKey(name === 'down' ? 'ArrowDown' : 'ArrowUp'); return }
        doScroll(0, name === 'down' ? 120 : -120)
        return
      }
      case 'left':
      case 'right': {
        if (hintMode || paletteOpen) return
        navAction(name === 'left' ? 'goBack' : 'goForward')
        return
      }
      case 'palette': setPaletteOpen(true); return
      case 'hints': if (hintMode) exitHints(); else enterHints(); return
      case 'hud': setHudOpen((o) => !o); return
      case 'osk': toggleOsk(!oskOpenRef.current); return
      case 'zoomIn': zoomStep(1); return
      case 'zoomOut': zoomStep(-1); return
      case 'tabRestore': restoreTab(); return
      default: {
        const key = MEDIA_KEYS[name]
        if (key) sendKey(key)
      }
    }
  }

  function handleGpConnect(gp) {
    setGpConnected(true)
    setGpName(gp && gp.id ? gp.id : 'Mando')
    addToast('Mando conectado: ' + (gp && gp.id ? gp.id : ''), 'ok')
    if (settings && settings.tvMode && settings.tvAutoFullscreen && !document.fullscreenElement) {
      window.api.toggleFullscreen()
      autoFsRef.current = true
    }
  }

  function handleGpDisconnect() {
    setGpConnected(false)
    addToast('Mando desconectado', 'info')
    exitHints()
    if (autoFsRef.current && document.fullscreenElement) {
      autoFsRef.current = false
      window.api.toggleFullscreen()
    }
  }

  function pokeActivity() {
    if (!tvMode) return
    setTvIdle(false)
    clearTimeout(tvIdleTimerRef.current)
    tvIdleTimerRef.current = setTimeout(() => setTvIdle(true), 4000)
  }

  function toggleTvMode() {
    const next = !tvMode
    window.api.setSetting({ tvMode: next })
    if (!next) setHudOpen(false)
    addToast(next ? 'Modo TV: conecta un mando Xbox' : 'Modo TV desactivado', 'info')
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
    { icon: I.tv, label: tvMode ? 'Salir del modo TV' : 'Modo TV (navegar con mando)', action: toggleTvMode },
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
    <div className={'app' + (presentation ? ' presentation' : '') + (tvMode ? ' tv-mode' : '') + (tvMode && tvIdle ? ' tv-idle' : '')} onDoubleClick={handleDblClick} onWheel={handleWheel}>
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
          onMute={muteTab}
          onMoveWindow={moveTabToWindow}
          onNewWindowUrl={openInNewWindow}
          closedCount={closedCount}
          onRestoreAll={restoreAllTabs}
          onReloadAll={reloadAllTabs}
          onNavigateTab={navigateTab}
          onRename={renameTab}
          onMove={moveTab}
          onCloseLeft={closeTabsLeft}
          onDetach={moveTabToWindow}
          windowId={windowIdRef.current}
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
            onAdd={(url, title) => window.api.addBookmark({ url, title }).then(() => { refreshBookmarks(); addToast('Marcador añadido', 'ok') })}
            onReorder={(ids) => {
              setBookmarks((prev) => {
                const map = new Map(prev.map((b) => [b.id, b]))
                const next = ids.map((id) => map.get(id)).filter(Boolean)
                window.api.reorderBookmarks(ids)
                return next
              })
            }}
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
            try { setShieldsOrigin(new URL(activeTab.url).origin) } catch { setShieldsOrigin(activeTab.url) }
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
          onToggleSidebar={() => toggleSidebar()}
          sidebarActive={!!sidebar}
          tvMode={tvMode}
          onToggleTv={toggleTvMode}
        />
      </div>

      <div className="body-row">
        {sidebar && (
          <Sidebar
            tab={sidebar}
            onTab={setSidebar}
            onNavigate={navigate}
            onClose={() => setSidebar(null)}
          />
        )}
      <div className={'page-container' + (splitWith ? ' splitscreen' : '')}>
        {ready && tabs.map((t) => (
          <webview
            key={t.id}
            ref={(el) => {
              if (el) {
                elsRef.current.set(t.id, el)
                attach(el, t.id)
              } else {
                elsRef.current.delete(t.id)
              }
            }}
            src={t.src}
            partition={incognitoRef.current ? (viewInfoRef.current.privatePartition || 'navegador-incognito') : undefined}
            preload={viewInfoRef.current.preload || undefined}
            className={'page-view' + (t.active ? ' active' : '') + (splitWith === t.id ? ' split-on' : '')}
          />
        ))}
        {splitWith && (
          <button className="split-exit" title="Salir de la vista dividida" onClick={() => setSplitWith(null)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        )}
        {statusUrl && (
          <div className="status-bar" title={statusUrl}>{statusUrl}</div>
        )}
      </div>
      </div>

      {tabSearchOpen && (() => {
        const q = tabSearchQuery.toLowerCase()
        const list = tabs.filter((t) => !q || ((t.title || '') + ' ' + (t.url || '')).toLowerCase().includes(q))
        return (
          <div className="tab-search-overlay" onClick={(e) => { if (e.target === e.currentTarget) setTabSearchOpen(false) }}>
            <div className="tab-search-box">
              <input autoFocus value={tabSearchQuery} onChange={(e) => setTabSearchQuery(e.target.value)} placeholder="Buscar pestaña…"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setTabSearchOpen(false)
                  if (e.key === 'Enter' && list[0]) { switchTab(list[0].id); setTabSearchOpen(false) }
                }} />
              <div className="tab-search-list">
                {list.slice(0, 20).map((t) => (
                  <div key={t.id} className={'ts-item' + (t.active ? ' active' : '')} onClick={() => { switchTab(t.id); setTabSearchOpen(false) }}>
                    <span className="ts-title">{t.title || 'Nueva pestaña'}</span>
                    <span className="ts-url">{t.url || ''}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}

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
      {tvMode && (
        <GamepadHud
          connected={gpConnected}
          gpName={gpName}
          cursorRef={cursorRef}
          hints={hints}
          hintSel={hintSel}
          hintActive={hintMode}
          hudOpen={hudOpen}
          idle={tvIdle}
        />
      )}
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
