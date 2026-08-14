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
import AIPanel from './components/AIPanel.jsx'
import GamepadHud from './components/GamepadHud.jsx'
import OnScreenKeyboard from './components/OnScreenKeyboard.jsx'
import { typeIntoChrome, typeIntoWebview } from './components/tvTyping.js'
import { useGamepad, rumble } from './components/useGamepad.js'
import { I } from './components/icons.jsx'

const PERM_NAMES = {
  media: 'Cámara y micrófono',
  camera: 'Cámara',
  microphone: 'Micrófono',
  geolocation: 'Ubicación',
  notifications: 'Notificaciones',
  'clipboard-read': 'Leer portapapeles',
  'clipboard-sanitized-write': 'Escribir portapapeles',
  'display-capture': 'Captura de pantalla',
  keyboardLock: 'Teclado',
  'window-management': 'Ventanas',
  fileSystem: 'Archivos',
  serial: 'Puertos serie',
  hid: 'Dispositivos HID',
  usb: 'Dispositivos USB',
  'storage-access': 'Almacenamiento',
  'local-fonts': 'Fuentes locales',
  fullscreen: 'Pantalla completa',
  pointerLock: 'Bloqueo del puntero',
  openExternal: 'Abrir enlaces externos',
  midi: 'MIDI',
  midiSysex: 'MIDI (sistema)',
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
  permissions: 'Permisos de sitios',
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

function fallbackCopyText(t) {
  const ta = document.createElement('textarea')
  ta.value = t
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  try { document.execCommand('copy') } catch {}
  document.body.removeChild(ta)
}

function copyText(t) {
  if (!t) return
  // El portapapeles del proceso principal funciona siempre (independiente del
  // foco/gesto del usuario en la ventana), a diferencia de navigator.clipboard.
  if (window.api && window.api.clipboardWrite) { window.api.clipboardWrite(t); return }
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).catch(() => fallbackCopyText(t))
      return
    }
  } catch {}
  fallbackCopyText(t)
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
  const siteInfoUrlRef = useRef(null)
  const [taskManagerOpen, setTaskManagerOpen] = useState(false)
  const [splitWith, setSplitWith] = useState(null)
  const [closedCount, setClosedCount] = useState(0)
  const [closedTabs, setClosedTabs] = useState([])
  const [statusUrl, setStatusUrl] = useState('')
  const [sidebar, setSidebar] = useState(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [sessionPrompt, setSessionPrompt] = useState(null)
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
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const kbRef = useRef(null)

  function toggleSidebar(tab) {
    setSidebar((cur) => (cur === tab ? null : (tab || 'bookmarks')))
  }
  const [permission, setPermission] = useState(null)
  const [incognito, setIncognito] = useState(false)
  const [savePrompt, setSavePrompt] = useState(null)
  const [urlOverrides, setUrlOverrides] = useState({})
  const [maximized, setMaximized] = useState(false)
  const bookmarkSuppressRef = useRef(false)
  const bookmarkSelfClosedRef = useRef(false)
  const bookmarkTimerRef = useRef(null)
  const popupOpenRef = useRef(null)
  const popupKeysRef = useRef(new Set())
  const pendingPermitRef = useRef(null)
  const pendingBookmarkRef = useRef(null)
  const dialogRef = useRef(null)
  const [paletteQuery, setPaletteQuery] = useState('')
  const [paletteSel, setPaletteSel] = useState(0)
  const [findQuery, setFindQuery] = useState('')
  const [tabSearchSel, setTabSearchSel] = useState(0)
  const [shieldsState, setShieldsState] = useState(null)
  const shieldsStateRef = useRef(null)
  const shieldsOriginRef = useRef(null)
  const [siteInfoData, setSiteInfoData] = useState(null)
  const [taskManagerTick, setTaskManagerTick] = useState(0)
  const taskRowsRef = useRef([])
  const paletteItemsRef = useRef([])

  const viewInfoRef = useRef({ newtab: '', welcome: '', pages: '', preload: '' })
  const incognitoRef = useRef(false)
  const settingsRef = useRef(null)
  const tabsRef = useRef([])
  const closedTabsRef = useRef([])
  const failedUrlRef = useRef(new Map())
  const reloadWatchRef = useRef(null)
  const sessionTimerRef = useRef(null)
  const creatingRef = useRef(new Set())
  const prevTabIdsRef = useRef(new Set())
  const [ready, setReady] = useState(false)

  const activeTab = tabs.find((t) => t.active) || null
  const inProgress = downloads.filter((d) => d.state === 'in-progress').length
  const tvMode = !!(settings && settings.tvMode)

  function activeTabId() {
    const t = tabsRef.current.find((x) => x.active)
    return t ? t.id : null
  }

  // Los popups son ventanas nativas externas: la página NUNCA se oculta.
  // Esta función queda como no-op para los componentes que la usaban.
  function overlaySource() {}

  function tabSearchItems(q) {
    const lq = (q || '').toLowerCase()
    return tabs.filter((t) => !lq || ((t.title || '') + ' ' + (t.url || '')).toLowerCase().includes(lq))
  }

  function buildListPopup(isPalette) {
    if (isPalette) {
      const items = paletteItemsRef.current.map((it) => it.sep ? it : ({ title: it.label, accel: it.accel, meta: it.meta }))
      return { key: 'palette-popup', payload: { type: 'palette', items, query: paletteQuery, selected: paletteSel } }
    }
    const items = tabSearchItems(tabSearchQuery).slice(0, 20).map((t) => ({ title: t.title || 'Nueva pestaña', url: t.url || '', id: t.id }))
    return { key: 'tabsearch-popup', payload: { type: 'tabsearch', items, query: tabSearchQuery, selected: tabSearchSel } }
  }

  function refreshShields() {
    const origin = shieldsOriginRef.current
    if (!origin) return
    window.api.shieldsGet(origin).then((st) => {
      if (st) { shieldsStateRef.current = st; setShieldsState(st) }
    }).catch(() => {})
  }

  function openNativePopup(key, opts) {
    if (!window.api.showPopup) return
    window.api.showPopup(Object.assign({ key }, opts))
    popupOpenRef.current = key
  }

  // Popups gestionados por efectos: se abre/actualiza según si la ventana sigue
  // abierta (Set), para que cerrar y REABRIR siempre vuelva a crearla.
  function showAppPopup(key, opts, payload) {
    if (!window.api.showPopup) return
    if (popupKeysRef.current.has(key)) { if (window.api.updatePopup) window.api.updatePopup(key, payload) }
    else { window.api.showPopup(Object.assign({ key }, opts, { payload })); popupKeysRef.current.add(key) }
  }
  function hideAppPopup(key) {
    if (popupKeysRef.current.has(key)) { window.api.hidePopup(key); popupKeysRef.current.delete(key) }
  }

  function handleWheel(e) {
    if (!e.ctrlKey) return
    e.preventDefault()
    const id = activeTabId()
    if (!id) return
    window.api.tabZoomGet(id).then((z) => {
      window.api.tabZoomSet(id, Math.min(3, Math.max(0.25, (z || 1) + (e.deltaY < 0 ? 0.1 : -0.1))))
    }).catch(() => {})
  }

  function refreshNavState() {
    const t = tabsRef.current.find((x) => x.active)
    if (!t) return
    window.api.tabNavState(t.id).then((st) => {
      setNavState({ canGoBack: !!st.canGoBack, canGoForward: !!st.canGoForward, isLoading: !!st.isLoading })
    }).catch(() => {})
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

  useEffect(() => {
    const off = window.api.onTabEvent((ev) => {
      const id = ev.id
      const type = ev.type
      if (type === 'dom-ready') {
        const z = settingsRef.current && settingsRef.current.defaultZoom
        if (z && z !== 1) window.api.tabZoomSet(id, z)
        const t = tabsRef.current.find((x) => x.id === id)
        if (t && t.active && t.wcId) window.api.setActiveWc(t.wcId)
        return
      }
      if (type === 'did-navigate') {
        const url = ev.url
        const internal = internalForSrc(url)
        if (internal === 'error') {
          setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, url: failedUrlRef.current.get(id) || errorPageOriginal(url), internal: 'error', title: 'No se puede acceder a este sitio' } : t)))
          return
        }
        setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, url: internal ? '' : url, internal, error: null } : t)))
        failedUrlRef.current.delete(id)
        if (!internal && url && url.startsWith('http') && !isLoopback(url) && !incognitoRef.current) {
          const t = tabsRef.current.find((x) => x.id === id)
          window.api.addHistory({ url, title: (t && t.title) || url })
        }
        refreshNavState()
        scheduleSessionSave()
        return
      }
      if (type === 'did-fail-load') {
        if (!ev.isMainFrame) return
        refreshNavState()
        if (ev.code === -3) return
        const url = ev.url || ''
        if (!url) return
        failedUrlRef.current.set(id, url)
        setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, url, error: { code: ev.code, desc: ev.desc || '', url }, title: 'No se puede acceder a este sitio' } : t)))
        window.api.tabLoad(id, 'nixer://error?url=' + encodeURIComponent(url) + '&code=' + ev.code + '&desc=' + encodeURIComponent(ev.desc || ''))
        return
      }
      if (type === 'did-navigate-in-page') {
        const internal = internalForSrc(ev.url)
        setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, url: internal ? '' : ev.url, internal } : t)))
        return
      }
      if (type === 'title') {
        if (ev.title) {
          setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, title: ev.title } : t)))
          try {
            const t = tabsRef.current.find((x) => x.id === id)
            if (t && t.url && t.url.startsWith('http')) window.api.updateHistoryTitle(t.url, ev.title)
          } catch {}
        }
        return
      }
      if (type === 'favicon') {
        setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, favicon: ev.favicons && ev.favicons[0] ? ev.favicons[0] : null } : t)))
        return
      }
      if (type === 'media-started') { setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, audible: true } : t))); return }
      if (type === 'media-paused') { setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, audible: false } : t))); return }
      if (type === 'loading') { refreshNavState(); return }
      if (type === 'found-in-page') { setFindResult(ev.result); return }
      if (type === 'render-gone') { setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, title: 'Pestaña no disponible' } : t))); return }
      if (type === 'tab-closed') { removeTabState(id); return }
    })
    return off
  }, [])

  function syncTabLayout() {
    if (window.__nixerDragging) return
    const pc = document.querySelector('.page-container')
    if (!pc) return
    const r = pc.getBoundingClientRect()
    if (!r.width || !r.height) return
    const visible = []
    const active = tabsRef.current.find((x) => x.active)
    if (active && active.wcId) {
      if (splitWith) {
        const half = r.width / 2
        const other = tabsRef.current.find((x) => x.id === splitWith)
        if (other && other.wcId) {
          visible.push({ id: other.id, rect: { x: r.x, y: r.y, width: half, height: r.height } })
        }
        visible.push({ id: active.id, rect: { x: r.x + half, y: r.y, width: half, height: r.height } })
      } else {
        visible.push({ id: active.id, rect: { x: r.x, y: r.y, width: r.width, height: r.height } })
      }
    }
    window.api.tabsLayout({ visible })
  }

  useEffect(() => {
    tabs.forEach((t) => {
      if (t.wcId || creatingRef.current.has(t.id)) return
      creatingRef.current.add(t.id)
      window.api.tabCreate({ id: t.id, src: t.src }).then((res) => {
        creatingRef.current.delete(t.id)
        if (!res || !res.wcId) return
        setTabs((prev) => prev.map((x) => (x.id === t.id ? { ...x, wcId: res.wcId } : x)))
        if (tabsRef.current.find((x) => x.id === t.id && x.active)) window.api.setActiveWc(res.wcId)
      }).catch(() => creatingRef.current.delete(t.id))
    })
  }, [tabs])

  useEffect(() => {
    const ids = new Set(tabs.map((t) => t.id))
    prevTabIdsRef.current.forEach((id) => {
      if (!ids.has(id)) window.api.tabClose(id)
    })
    prevTabIdsRef.current = ids
  }, [tabs])

  useEffect(() => {
    function sync() { syncTabLayout() }
    sync()
    const pc = document.querySelector('.page-container')
    let ro = null
    if (pc && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(sync)
      ro.observe(pc)
    }
    window.addEventListener('resize', sync)
    function onDragEnd() { syncTabLayout() }
    window.addEventListener('nixer-drag-end', onDragEnd)
    return () => {
      if (ro) ro.disconnect()
      window.removeEventListener('resize', sync)
      window.removeEventListener('nixer-drag-end', onDragEnd)
    }
  }, [tabs, splitWith])

  // ---- Popups como ventanas nativas (la página nunca se oculta) --------------
  useEffect(() => {
    if (paletteOpen) {
      const p = buildListPopup(true)
      showAppPopup('palette-popup', { x: Math.round(window.innerWidth / 2 - 340), y: 70, width: 680, height: Math.min(480, window.innerHeight - 160), keepOpen: true, closeOnBlur: false }, p.payload)
    } else {
      hideAppPopup('palette-popup')
    }
  }, [paletteOpen, paletteQuery, paletteSel])

  useEffect(() => {
    if (tabSearchOpen) {
      const p = buildListPopup(false)
      showAppPopup('tabsearch-popup', { x: Math.round(window.innerWidth / 2 - 300), y: 80, width: 600, height: Math.min(420, window.innerHeight - 160), keepOpen: true, closeOnBlur: false }, p.payload)
    } else {
      hideAppPopup('tabsearch-popup')
    }
  }, [tabSearchOpen, tabSearchQuery, tabSearchSel, tabs])

  useEffect(() => {
    if (findOpen) {
      window.api.showPopup({ key: 'find-popup', x: 20, y: 40, width: 380, height: 96, keepOpen: true, closeOnBlur: false, payload: { type: 'find', query: findQuery, result: findResult } })
      popupKeysRef.current.add('find-popup')
    } else {
      hideAppPopup('find-popup')
    }
  }, [findOpen])

  useEffect(() => {
    if (toasts.length) {
      showAppPopup('toasts-popup', { x: Math.round(window.innerWidth - 340), y: Math.round(window.innerHeight - 60 - toasts.length * 64), width: 320, height: Math.min(320, toasts.length * 64 + 20), focus: false, focusable: false, closeOnBlur: false }, { type: 'toasts', toasts: toasts.slice(-4) })
    } else {
      hideAppPopup('toasts-popup')
    }
  }, [toasts])

  useEffect(() => {
    if (modal && modal.type === 'confirm') {
      dialogRef.current = modal
      showAppPopup('dialog-popup', { x: Math.round(window.innerWidth / 2 - 220), y: Math.round(window.innerHeight / 2 - 90), width: 440, height: 180 }, { type: 'dialog', message: '<b>' + (modal.title || '') + '</b><br>' + (modal.message || ''), buttons: [{ label: modal.confirmLabel || 'Aceptar', value: 'ok', primary: true, danger: !!modal.danger }, { label: 'Cancelar', value: 'cancel' }] })
    } else if (savePrompt) {
      dialogRef.current = {
        onConfirm: () => { window.api.savePassword(savePrompt); addToast('Contraseña guardada', 'ok') },
        onCancel: () => {},
      }
      showAppPopup('dialog-popup', { x: Math.round(window.innerWidth / 2 - 220), y: Math.round(window.innerHeight / 2 - 80), width: 440, height: 170 }, { type: 'dialog', message: '¿Guardar la contraseña de <b>' + savePrompt.origin + '</b>?<br><span style="font-size:12px">Usuario: ' + savePrompt.username + '</span>', buttons: [{ label: 'Guardar', value: 'ok', primary: true }, { label: 'Ahora no', value: 'cancel' }] })
    } else if (sessionPrompt) {
      dialogRef.current = {
        onConfirm: () => { const s = sessionPrompt; setSessionPrompt(null); restoreSessionTabs(s) },
        onCancel: () => { setSessionPrompt(null); addTab() },
      }
      showAppPopup('dialog-popup', { x: Math.round(window.innerWidth / 2 - 220), y: Math.round(window.innerHeight / 2 - 80), width: 440, height: 170 }, { type: 'dialog', message: '¿Restaurar las <b>' + sessionPrompt.length + '</b> pestañas de la sesión anterior?', buttons: [{ label: 'Restaurar', value: 'ok', primary: true }, { label: 'Nueva pestaña', value: 'cancel' }] })
    } else {
      hideAppPopup('dialog-popup')
    }
  }, [modal, savePrompt, sessionPrompt])

  useEffect(() => {
    shieldsOriginRef.current = shieldsOrigin
  }, [shieldsOrigin])

  useEffect(() => {
    siteInfoUrlRef.current = siteInfoUrl
  }, [siteInfoUrl])

  useEffect(() => {
    if (shieldsOrigin) {
      refreshShields()
      const anchor = shieldsAnchor
      const w = 340
      const x = anchor ? Math.max(8, Math.round(anchor.right - w)) : 60
      const y = anchor ? Math.round(anchor.bottom + 6) : 60
      showAppPopup('shields-popup', { x, y, width: w, height: 250, keepOpen: true, closeOnBlur: false }, { type: 'shields', origin: shieldsOrigin, state: shieldsState, ads: 0, scripts: 0, trackers: 0 })
    } else {
      hideAppPopup('shields-popup')
    }
  }, [shieldsOrigin, shieldsAnchor, shieldsState])

  useEffect(() => {
    if (!siteInfoUrl) {
      hideAppPopup('siteinfo-popup')
      return
    }
    let origin = ''
    try { origin = new URL(siteInfoUrl).origin } catch {}
    const anchor = siteInfoAnchor
    const w = 340
    const x = anchor ? Math.max(8, Math.round(anchor.right - w)) : 60
    const y = anchor ? Math.round(anchor.bottom + 6) : 60
    const show = (kind, label) => showAppPopup('siteinfo-popup', { x, y, width: w, height: 210 }, { type: 'siteinfo', origin, kind, label })
    if (window.api.certStatus) {
      window.api.certStatus(origin).then((r) => {
        if (r && r.secure) show('secure', 'Conexión segura (TLS)')
        else if (r && r.error) show('insecure', 'Certificado no válido')
        else show('insecure', 'Conexión no segura')
      }).catch(() => show(siteInfoUrl.startsWith('https://') ? 'secure' : 'insecure', siteInfoUrl.startsWith('https://') ? 'Conexión segura' : 'Conexión no segura'))
    } else {
      show(siteInfoUrl.startsWith('https://') ? 'secure' : 'insecure', siteInfoUrl.startsWith('https://') ? 'Conexión segura' : 'Conexión no segura')
    }
  }, [siteInfoUrl, siteInfoAnchor])

  function refreshTaskManager() {
    window.api.taskManagerList().then((r) => {
      taskRowsRef.current = (r && r.rows) || []
      setTaskManagerTick((x) => x + 1)
    }).catch(() => {})
  }

  useEffect(() => {
    if (taskManagerOpen) {
      refreshTaskManager()
    } else {
      hideAppPopup('taskmanager-popup')
    }
  }, [taskManagerOpen])

  useEffect(() => {
    if (!taskManagerOpen) return
    const payload = { type: 'taskmanager', rows: taskRowsRef.current, total: taskManagerTotal() }
    showAppPopup('taskmanager-popup', { x: Math.round(window.innerWidth / 2 - 300), y: 70, width: 620, height: 420, closeOnBlur: false, keepOpen: true }, payload)
  }, [taskManagerTick, taskManagerOpen])

  function taskManagerTotal() {
    let total = 0
    const seen = new Set()
    taskRowsRef.current.forEach((r) => { if (r.id && !seen.has(r.id)) { seen.add(r.id); total += r.mem || 0 } })
    return total
  }

  function newTabRecord({ url = '', src, internal, title, pinned = false, group = null, active = false, wcId = null } = {}) {
    const finalSrc = src || computeSrc(url)
    return {
      id: Date.now() + '-' + tabSeq++,
      url,
      src: finalSrc,
      title: title || (url ? '' : (internalForSrc(finalSrc) === 'welcome' ? 'Bienvenida' : 'Nueva pestaña')),
      favicon: null,
      pinned,
      internal: internal || internalForSrc(finalSrc),
      wcId,
      active,
      group,
      audible: false,
      muted: false,
    }
  }

  function addTab(url, opts = {}) {
    const tab = newTabRecord({ url, src: opts.src, internal: opts.internal, title: opts.title, pinned: opts.pinned, group: opts.group, wcId: opts.wcId })
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
      const t = tabsRef.current.find((x) => x.id === id)
      if (t && t.wcId) window.api.setActiveWc(t.wcId)
      refreshNavState()
      syncTabLayout()
    })
  }

  function switchTab(id) {
    activate(id)
  }

  function removeTabState(id) {
    const list = tabsRef.current
    const idx = list.findIndex((t) => t.id === id)
    const t = list[idx]
    if (!t) return
    if (t.url && t.url.startsWith('http')) closedTabsRef.current.unshift({ id: 'ct' + Date.now() + '-' + closedTabsRef.current.length, url: t.url, title: t.title })
    if (closedTabsRef.current.length > 50) closedTabsRef.current.length = 50
    setClosedCount(closedTabsRef.current.length)
    setClosedTabs([...closedTabsRef.current])
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

  function closeTab(id) {
    if (!id || !tabsRef.current.some((t) => t.id === id)) return
    window.api.tabClose(id)
  }

  function closeAllTabs() {
    if (settingsRef.current && settingsRef.current.confirmCloseMultiple !== false) {
      if (!window.confirm('¿Cerrar todas las pestañas?')) return
    }
    tabs.forEach((t) => closeTab(t.id))
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
    window.api.tabMute(id, next)
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
      addTab(url, { activate: true })
      removeEmptyTab(t.id)
      return
    }
    addTab(url, { activate: !(settingsRef.current && settingsRef.current.openLinksInBackground) })
  }

  function removeEmptyTab(id) {
    setTabs((prev) => {
      const next = prev.filter((x) => x.id !== id)
      if (!next.length) return prev
      return next
    })
  }

  function navigateTab(id, url) {
    if (id && url) window.api.tabLoad(id, url)
  }

  function restoreAllTabs() {
    while (closedTabsRef.current.length) {
      const t = closedTabsRef.current.shift()
      if (t) addTab(t.url, { activate: false })
    }
    setClosedCount(0)
    setClosedTabs([])
  }

  function restoreTabId(id) {
    const i = closedTabsRef.current.findIndex((t) => t.id === id)
    if (i < 0) return
    const t = closedTabsRef.current.splice(i, 1)[0]
    setClosedCount(closedTabsRef.current.length)
    setClosedTabs([...closedTabsRef.current])
    if (t) addTab(t.url)
  }

  function reloadAllTabs() {
    tabs.forEach((t) => {
      if (t.error && t.error.url) window.api.tabLoad(t.id, t.error.url)
      else window.api.tabReload(t.id, false)
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
    setClosedTabs([...closedTabsRef.current])
    if (t) addTab(t.url)
  }

  function navigate(url) {
    const id = activeTabId()
    if (id && url) window.api.tabLoad(id, url)
  }

  function navAction(action) {
    const id = activeTabId()
    if (!id) return
    if (action === 'goBack') window.api.tabBack(id)
    else if (action === 'goForward') window.api.tabForward(id)
    else if (action === 'reload') {
      const t = activeTab
      const retryUrl = (t && ((t.error && t.error.url) || (t.internal === 'error' && t.url))) || ''
      if (retryUrl) window.api.tabLoad(id, retryUrl)
      else window.api.tabReload(id, false)
      scheduleReloadWatchdog(id, t)
    }
    else if (action === 'stop') window.api.tabStop(id)
    refreshNavState()
  }

  function scheduleReloadWatchdog(id, t) {
    clearTimeout(reloadWatchRef.current)
    if (!id || !t) return
    reloadWatchRef.current = setTimeout(() => {
      const tab = tabsRef.current.find((x) => x.id === t.id)
      if (!tab || !tab.active) return
      window.api.tabNavState(id).then((st) => {
        if (!st || !st.isLoading) return
        window.api.tabStop(id)
        setTimeout(() => {
          window.api.tabGetUrl(id).then((cur) => {
            if (cur && cur !== 'about:blank') window.api.tabLoad(id, cur)
            else window.api.tabReload(id, false)
          }).catch(() => {})
        }, 350)
      }).catch(() => {})
    }, 6000)
  }

  function openInternal(key) {
    addTab('', { src: 'nixer://' + key, internal: key, title: PAGE_TITLES[key] || key })
  }

  function home() {
    if (settings && settings.homePage) navigate(settings.homePage)
  }

  function doFind(text, findNext) {
    const id = activeTabId()
    if (!id) return
    if (!text) {
      window.api.tabStopFind(id, 'clearSelection')
      return
    }
    window.api.tabFind(id, text, !!findNext)
  }

  function stopFind() {
    const id = activeTabId()
    if (id) window.api.tabStopFind(id, 'clearSelection')
    setFindResult(null)
  }

  function scheduleSessionSave() {
    if (incognitoRef.current) return
    clearTimeout(sessionTimerRef.current)
    sessionTimerRef.current = setTimeout(saveSessionNow, 500)
  }

  function saveSessionNow() {
    if (incognitoRef.current) return
    clearTimeout(sessionTimerRef.current)
    sessionTimerRef.current = null
    const list = tabsRef.current
      .filter((t) => t.url && t.url.startsWith('http') && !isLoopback(t.url))
      .map((t) => ({ url: t.url, pinned: !!t.pinned, group: t.group ? t.group.id : undefined }))
    try { window.api.saveSession(list) } catch {}
  }

  async function restoreSessionTabs(sess) {
    if (!sess || !sess.length) return
    const groups = (await window.api.groups.get().catch(() => ({}))) || {}
    sess.forEach((u) => addTab(u.url, { pinned: u.pinned, group: u.group ? groups[u.group] : undefined }))
  }

  useEffect(() => {
    function flush() { saveSessionNow() }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
    return () => {
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
    }
  }, [])

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
          restoreSessionTabs(sess)
        } else if (sess && sess.length && (w.initial || w.crash)) {
          setSessionPrompt(sess)
        } else {
          if (!w.awaitingTab && tabsRef.current.length === 0) addTab()
        }
      } catch {}
      window.api.downloadsList().then((list) => { if (!cancelled && Array.isArray(list)) setDownloads(list) }).catch(() => {})
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
      window.api.onPermissionRequest((req) => {
        pendingPermitRef.current = req
        if (!window.api.showPopup) { setPermission(req); return }
        try {
          const anchor = document.querySelector('.sec-chip, .shield-btn')
          const r = anchor ? anchor.getBoundingClientRect() : null
          const width = 320
          const x = r ? Math.max(8, Math.round(r.right - width)) : Math.max(8, Math.round(window.innerWidth - width - 12))
          const y = r ? Math.round(r.bottom + 6) : 60
          window.api.showPopup({
            key: 'permission-popup',
            x,
            y,
            width,
            height: 188,
            closeOnBlur: false,
            payload: {
              type: 'permission',
              id: req.id,
              origin: req.origin,
              permission: req.permission,
              label: PERM_NAMES[req.permission] || req.permission,
            },
          })
          popupOpenRef.current = 'permission-popup'
        } catch { setPermission(req) }
      }),
      window.api.onPopupAction(({ key, data }) => {
        if (popupOpenRef.current === key) popupOpenRef.current = null
        if (key === 'permission-popup') {
          let payload = null
          try { payload = JSON.parse(data || '{}') } catch {}
          const p = pendingPermitRef.current
          if (p && payload && payload.mode) {
            window.api.permissionResponse({ id: p.id, allow: payload.mode !== 'deny', remember: !!payload.remember, mode: payload.mode })
          }
          return
        }
        if (key === 'bookmark-popup') {
          let payload = null
          try { payload = JSON.parse(data || '{}') } catch {}
          if (payload && payload.mode === 'save') {
            const bm = pendingBookmarkRef.current
            if (bm) window.api.addBookmark({ url: bm.url, title: payload.title || bm.title }).then(() => {
              refreshBookmarks()
              setBookmarked(true)
              addToast('Marcador añadido', 'ok')
            })
          }
          return
        }
        if (key === 'palette-popup' || key === 'tabsearch-popup') {
          const isPalette = key === 'palette-popup'
          let payload = null
          try { payload = JSON.parse(data || '{}') } catch {}
          if (!payload || !payload.t) return
          if (payload.t === 'close') {
            if (isPalette) setPaletteOpen(false)
            else setTabSearchOpen(false)
            return
          }
          if (payload.t === 'q') {
            if (isPalette) setPaletteQuery(payload.v || '')
            else setTabSearchQuery(payload.v || '')
            if (window.api.updatePopup) window.api.updatePopup(key, buildListPopup(isPalette).payload)
            return
          }
          if (payload.t === 'down' || payload.t === 'up') {
            const d = payload.t === 'down' ? 1 : -1
            if (isPalette) setPaletteSel((s) => s + d)
            else setTabSearchSel((s) => s + d)
            if (window.api.updatePopup) window.api.updatePopup(key, buildListPopup(isPalette).payload)
            return
          }
          if (payload.t === 'pick' || payload.t === 'enter') {
            const q = isPalette ? paletteQuery : tabSearchQuery
            const items = isPalette ? paletteItems : tabSearchItems(q)
            const sel = isPalette ? paletteSel : tabSearchSel
            const it = items.filter((x) => !x.sep && (!q || (x.label + ' ' + (x.meta || '')).toLowerCase().includes(q.toLowerCase())))[payload.t === 'enter' ? sel : (payload.i || 0)]
            if (isPalette) setPaletteOpen(false)
            else setTabSearchOpen(false)
            if (it) {
              if (isPalette && it.action) it.action()
              else if (!isPalette && it.id) switchTab(it.id)
            }
          }
          return
        }
        if (key === 'find-popup') {
          let payload = null
          try { payload = JSON.parse(data || '{}') } catch {}
          if (!payload || !payload.t) return
          if (payload.t === 'close') { stopFind(); setFindOpen(false); return }
          if (payload.t === 'q') { setFindQuery(payload.v || ''); doFind(payload.v || '', false); return }
          if (payload.t === 'next') doFind(findQuery, true)
          if (payload.t === 'prev') doFind(findQuery, true)
          return
        }
        if (key === 'dialog-popup') {
          let payload = null
          try { payload = JSON.parse(data || '{}') } catch {}
          if (!payload || payload.t !== 'btn') return
          const dlg = dialogRef.current
          if (dlg && payload.v === 'ok' && dlg.onConfirm) dlg.onConfirm()
          else if (dlg && dlg.onCancel) dlg.onCancel()
          dialogRef.current = null
          return
        }
        if (key === 'shields-popup') {
          let payload = null
          try { payload = JSON.parse(data || '{}') } catch {}
          if (!payload || !payload.t) return
          const origin = shieldsOriginRef.current
          if (payload.t === 'toggle' && origin && payload.k) {
            const s = shieldsStateRef.current || {}
            const patch = {}
            patch[payload.k] = !s[payload.k]
            const next = Object.assign({}, s, patch)
            shieldsStateRef.current = next
            setShieldsState(next)
            if (window.api.updatePopup) window.api.updatePopup('shields-popup', { type: 'shields', origin, state: next, ads: 0, scripts: 0, trackers: 0 })
            window.api.shieldsSet(origin, patch).then(() => { refreshShields() })
          }
          if (payload.t === 'clear' && origin) {
            window.api.siteClear(origin).then(() => addToast('Datos del sitio eliminados', 'ok'))
          }
          return
        }
        if (key === 'siteinfo-popup') {
          let payload = null
          try { payload = JSON.parse(data || '{}') } catch {}
          if (!payload || !payload.t) return
          if (payload.t === 'copy') {
            const t = activeTab
            if (t && t.url) copyText(t.url)
          }
          if (payload.t === 'clear' && siteInfoUrlRef.current) {
            window.api.siteClear(new URL(siteInfoUrlRef.current).origin).then(() => addToast('Cookies y datos eliminados', 'ok'))
          }
          return
        }
        if (key === 'taskmanager-popup') {
          let payload = null
          try { payload = JSON.parse(data || '{}') } catch {}
          if (payload && payload.t === 'close') { setTaskManagerOpen(false); return }
          if (payload && payload.t === 'kill' && taskRowsRef.current[payload.i]) {
            const wcId = taskRowsRef.current[payload.i].id
            const t = tabsRef.current.find((x) => x.wcId === Number(wcId))
            if (t) { window.api.tabCloseForce(t.id); removeTabState(t.id) }
            refreshTaskManager()
          }
          return
        }
      }),
      window.api.onPopupClosed((key) => {
        if (popupOpenRef.current === 'bookmark-popup' && !bookmarkSelfClosedRef.current) {
          bookmarkSuppressRef.current = true
          clearTimeout(bookmarkTimerRef.current)
          bookmarkTimerRef.current = setTimeout(() => { bookmarkSuppressRef.current = false }, 400)
        }
        bookmarkSelfClosedRef.current = false
        popupOpenRef.current = null
        if (key) popupKeysRef.current.delete(key)
        // Si el popup se cerró por fuera (clic externo), el estado de la UI debe
        // volver a su valor inicial para que el atajo pueda volver a abrirlo.
        if (key === 'taskmanager-popup') setTaskManagerOpen(false)
        else if (key === 'palette-popup') setPaletteOpen(false)
        else if (key === 'find-popup') setFindOpen(false)
        else if (key === 'tabsearch-popup') setTabSearchOpen(false)
        else if (key === 'shields-popup') { setShieldsOrigin(null); setShieldsAnchor(null) }
        else if (key === 'siteinfo-popup') { setSiteInfoUrl(null); setSiteInfoAnchor(null) }
        else if (key === 'dialog-popup') { setModal((m) => (m && m.type === 'confirm' ? null : m)); setSavePrompt(null); setSessionPrompt(null) }
      }),
      window.api.onSavePasswordPrompt((cred) => setSavePrompt(cred)),
      window.api.onUi((action, data) => {
        if (action === 'new-tab') addTab()
        else if (action === 'open-tab') openExternal(data)
        else if (action === 'open-tab-bg') addTab(data, { activate: false })
        else if (action === 'tab-adopted') {
          const d = data
          if (d && d.id) {
            const existing = tabsRef.current.find((x) => x.id === d.id)
            if (existing) activate(existing.id)
            else addTab(d.url || '', { src: d.url || '', internal: d.url ? internalForSrc(d.url) : null, title: d.title || '', wcId: d.wcId, activate: true })
          }
        }
        else if (action === 'close-tab') closeTab(activeTab ? activeTab.id : null)
        else if (action === 'restore-tab') restoreTab()
        else if (action === 'cycle-tab') cycleTab(data)
        else if (action === 'open-page') openInternal(data)
        else if (action === 'open-reader') addTab('', { src: 'nixer://reader?id=' + data, internal: 'reader', title: 'Modo lectura' })
        else if (action === 'open-find') setFindOpen(true)
        else if (action === 'open-palette') setPaletteOpen(true)
        else if (action === 'toggle-ai') setAiOpen((o) => !o)
        else if (action === 'focus-address') setFocusSignal((s) => s + 1)
        else if (action === 'drag-highlight') window.dispatchEvent(new CustomEvent('nixer-drag-highlight', { detail: !!data }))
        else if (action === 'open-taskmanager') setTaskManagerOpen((o) => !o)
        else if (action === 'home') home()
        else if (action === 'reload') navAction('reload')
        else if (action === 'bookmark-page') onStar()
        else if (action === 'activate-tab') {
          const t = tabsRef.current.find((x) => x.wcId === Number(data))
          if (t) activate(t.id)
        }
        else if (action === 'close-tab-by-wc') {
          const t = tabsRef.current.find((x) => x.wcId === Number(data))
          if (t) { window.api.tabCloseForce(t.id); removeTabState(t.id) }
        }
        else if (action === 'ui-toast') {
          addToast(data && data.text, data && data.kind)
        }
        else if (action === 'profiles-changed') {
          refreshBookmarks()
          window.api.getSettings().then((st) => setSettings(st)).catch(() => {})
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
          const t = activeTab
          if (t) window.api.tabMute(t.id, !t.muted)
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
          removeTabState(String(data))
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
    window.api.uiReady && window.api.uiReady()
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
    if (!shieldsOrigin && !siteInfoUrl) return
    function close(e) {
      if (e.target.closest && e.target.closest('.popup-card, .shield-btn, .sec-chip')) return
      setShieldsOrigin(null)
      setShieldsAnchor(null)
      setSiteInfoUrl(null)
      setSiteInfoAnchor(null)
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        setShieldsOrigin(null)
        setShieldsAnchor(null)
        setSiteInfoUrl(null)
        setSiteInfoAnchor(null)
      }
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [shieldsOrigin, siteInfoUrl])

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
      root.style.setProperty('--tab-min-width', (s.tabMinWidth || 72) + 'px')
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
      setKeyboardOpen(!!open)
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

  function onStar(btn) {
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
      if (bookmarkSuppressRef.current) {
        bookmarkSuppressRef.current = false
        clearTimeout(bookmarkTimerRef.current)
        return
      }
      if (window.api.showPopup && popupOpenRef.current !== 'bookmark-popup') {
        pendingBookmarkRef.current = { url: activeTab.url, title: activeTab.title }
        const r = (btn && btn.getBoundingClientRect) ? btn.getBoundingClientRect() : null
        const width = 340
        const x = r ? Math.max(8, Math.round(r.right - width)) : Math.max(8, Math.round(window.innerWidth - width - 12))
        const y = r ? Math.round(r.bottom + 6) : 60
        window.api.showPopup({
          key: 'bookmark-popup',
          x,
          y,
          width,
          height: 206,
          payload: { type: 'bookmark', url: activeTab.url, title: activeTab.title },
        })
        popupOpenRef.current = 'bookmark-popup'
      } else if (window.api.showPopup && popupOpenRef.current === 'bookmark-popup') {
        bookmarkSelfClosedRef.current = true
        window.api.hidePopup('bookmark-popup')
        popupOpenRef.current = null
      } else {
        setModal({ type: 'bookmark', url: activeTab.url, title: activeTab.title })
      }
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
    const id = activeTabId()
    const pc = document.querySelector('.page-container')
    if (id && pc) {
      try {
        const r = pc.getBoundingClientRect()
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          return { target: 'webview', id, x: x - r.left, y: y - r.top }
        }
      } catch {}
    }
    return { target: 'chrome' }
  }

  function sendWebMouse(id, x, y, action, opts) {
    opts = opts || {}
    const pt = { x: Math.round(x), y: Math.round(y) }
    if (action === 'move') window.api.tabInput(id, { type: 'mouseMove', ...pt, movementX: 0, movementY: 0, button: opts.button || 'left', buttons: opts.buttons || 0 })
    else if (action === 'down') window.api.tabInput(id, { type: 'mouseDown', ...pt, button: opts.button || 'left', clickCount: opts.count || 1 })
    else if (action === 'up') window.api.tabInput(id, { type: 'mouseUp', ...pt, button: opts.button || 'left', clickCount: opts.count || 1 })
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
      sendWebMouse(t.id, t.x, t.y, 'down', { button, count })
      sendWebMouse(t.id, t.x, t.y, 'up', { button, count })
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
      window.api.tabInput(t.id, { type: 'mouseWheel', x: Math.round(t.x), y: Math.round(t.y), deltaX: Math.round(dx), deltaY: Math.round(dy) })
    } else {
      sendChromeMouse('wheel', c.x, c.y, { deltaX: dx, deltaY: dy })
    }
  }

  function dragMove(x, y, down) {
    const t = pointerTarget(x, y)
    if (t.target === 'webview') {
      if (down) sendWebMouse(t.id, t.x, t.y, 'down', { button: 'left', count: 1 })
      else sendWebMouse(t.id, t.x, t.y, 'up', { button: 'left', count: 1 })
    } else {
      if (down) sendChromeMouse('down', x, y, { button: 'left' })
      else sendChromeMouse('up', x, y, { button: 'left' })
    }
  }

  function sendKey(code) {
    const id = activeTabId()
    if (!id) return
    const kc = code.length === 1 && /[a-z]/.test(code) ? code.toUpperCase() : code
    window.api.tabInput(id, { type: 'keyDown', keyCode: kc })
    window.api.tabInput(id, { type: 'keyUp', keyCode: kc })
  }

  function synthKey(key) {
    const el = document.activeElement
    if (!el) return
    try {
      el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    } catch {}
  }

  function zoomStep(dir) {
    const id = activeTabId()
    if (!id) return
    window.api.tabZoomGet(id).then((z) => {
      window.api.tabZoomSet(id, Math.min(3, Math.max(0.25, (z || 1) + dir * 0.1)))
    }).catch(() => {})
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

  const SHIFT_CHARS = new Set('!?@#$%&*()_+=:;"\'<>/\\|{}[]~`'.split(''))

  function typeKey(key) {
    const ae = document.activeElement
    const isChromeField = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)
    if (isChromeField) typeIntoChrome(ae, key)
    else typeIntoWebview(activeTabId(), key)
    rumble(20, 0.2, 0.2)
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
    const id = activeTabId()
    if (!id) return
    window.api.tabExecute(id, HINT_COLLECT)
      .then((points) => {
        if (!Array.isArray(points) || !points.length) { addToast('No hay enlaces visibles', 'info'); return }
        const pc = document.querySelector('.page-container')
        const r = (pc || document.body).getBoundingClientRect()
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
    const id = activeTabId()
    const h = hints[hintSel]
    if (!id || !h) { exitHints(); return }
    sendWebMouse(id, h.xv, h.yv, 'down', { button: 'left', count: 1 })
    sendWebMouse(id, h.xv, h.yv, 'up', { button: 'left', count: 1 })
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
          if (t.target === 'webview') sendWebMouse(t.id, t.x, t.y, 'move', { buttons: 1 })
          else sendChromeMouse('move', ev.x, ev.y, { buttons: 1 })
        } else if (tvMode) {
          const t = pointerTarget(ev.x, ev.y)
          if (t.target === 'webview') sendWebMouse(t.id, t.x, t.y, 'move', { buttons: 0 })
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
        if (keyboardOpen) { if (kbRef.current) kbRef.current.press(); return }
        doPointerClick(c.x, c.y, 'left', 1)
        rumble(25, 0.3, 0.3)
        return
      }
      case 'cancel': {
        if (keyboardOpen) { toggleOsk(false); return }
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
        if (keyboardOpen) { if (kbRef.current) kbRef.current.nav(name === 'down' ? 'down' : 'up'); return }
        if (hintMode) { cycleHint(name === 'down' ? 1 : -1); return }
        if (paletteOpen) { synthKey(name === 'down' ? 'ArrowDown' : 'ArrowUp'); return }
        doScroll(0, name === 'down' ? 120 : -120)
        return
      }
      case 'left':
      case 'right': {
        if (keyboardOpen) { if (kbRef.current) kbRef.current.nav(name === 'left' ? 'left' : 'right'); return }
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
    ai: () => setAiOpen((o) => !o),
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
    { icon: I.window, label: 'Abrir overlay en juegos', accel: 'Ctrl+Shift+O', action: () => window.api.overlayToggle() },
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
  paletteItemsRef.current = paletteItems

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
          closedTabs={closedTabs}
          onRestoreAll={restoreAllTabs}
          onRestoreId={restoreTabId}
          onReloadAll={reloadAllTabs}
          onNavigateTab={navigateTab}
          onRename={renameTab}
          onMove={moveTab}
          onCloseLeft={closeTabsLeft}
          onDetach={moveTabToWindow}
          windowId={windowIdRef.current}
          onOverlayChange={overlaySource}
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
            onOverlayChange={overlaySource}
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
          downloads={downloads}
          onNavigate={navigate}
          onNavAction={navAction}
          onToggleBookmark={onStar}
          onOpenPage={openInternal}
          onOpenPalette={() => setPaletteOpen(true)}
          onOverlayChange={overlaySource}
          onShields={(btn) => {
            if (!(activeTab && activeTab.url && activeTab.url.startsWith('http'))) return
            if (shieldsOrigin) { setShieldsOrigin(null); setShieldsAnchor(null); return }
            setSiteInfoUrl(null)
            setSiteInfoAnchor(null)
            setShieldsAnchor(btn ? btn.getBoundingClientRect() : null)
            try { setShieldsOrigin(new URL(activeTab.url).origin) } catch { setShieldsOrigin(activeTab.url) }
          }}
          onSiteInfo={(btn) => {
            if (!(activeTab && activeTab.url)) return
            if (siteInfoUrl) { setSiteInfoUrl(null); setSiteInfoAnchor(null); return }
            setShieldsOrigin(null)
            setShieldsAnchor(null)
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
          aiOpen={aiOpen}
          onToggleAi={() => setAiOpen((o) => !o)}
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
      <div className={'page-container' + (splitWith ? ' splitscreen' : '') + (aiOpen ? ' ai-open' : '')}>
        {splitWith && (
          <button className="split-exit" title="Salir de la vista dividida" onClick={() => setSplitWith(null)}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        )}
      </div>
      {aiOpen && (
        <AIPanel tabs={tabs} onClose={() => setAiOpen(false)} onOpenLink={(url) => openExternal(url)} />
      )}
      </div>

      {permission && (
        <PermissionModal
          request={permission}
          onClose={() => { window.api.permissionResponse({ id: permission.id, allow: false, remember: false }); setPermission(null) }}
        />
      )}
      {modal && modal.type === 'bookmark' && (
        <BookmarkModal
          url={modal.url}
          initialTitle={modal.title}
          onSave={saveBookmark}
          onCancel={() => setModal(null)}
        />
      )}
      {modal && modal.type === 'confirm' && !window.api.showPopup && (
        <ConfirmModal
          title={modal.title}
          message={modal.message}
          confirmLabel={modal.confirmLabel}
          danger={modal.danger}
          onConfirm={modal.onConfirm}
          onCancel={() => setModal(null)}
        />
      )}
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
      {tvMode && keyboardOpen && <OnScreenKeyboard ref={kbRef} onKey={typeKey} />}
    </div>
  )

  function closeTabByWc(wcId) {
    const t = tabs.find((x) => x.wcId === Number(wcId))
    if (t) { window.api.tabCloseForce(t.id); removeTabState(t.id) }
  }
}

function PermissionModal({ request, onClose }) {
  const [remember, setRemember] = useState(false)
  function respond(mode) {
    window.api.permissionResponse({ id: request.id, allow: mode !== 'deny', remember, mode })
    onClose()
  }
  const name = PERM_NAMES[request.permission] || request.permission
  return (
    <Modal
      title="Permiso solicitado"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={() => respond('deny')}>Bloquear</button>
          <button className="btn" onClick={() => respond('once')}>Permitir una vez</button>
          <button className="btn primary" onClick={() => respond('allow')}>Permitir</button>
        </>
      }
    >
      <p className="modal-msg">
        <b>{request.origin}</b> quiere usar: <b>{name}</b>
      </p>
      <label className="perm-remember">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Recordar mi decisión para este sitio
      </label>
      <div className="modal-url">{remember ? 'Se aplicará siempre que visites este sitio.' : 'Se aplicará solo a esta petición o mientras la pestaña siga abierta.'}</div>
    </Modal>
  )
}
