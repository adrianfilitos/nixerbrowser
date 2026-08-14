import { useEffect, useRef, useState } from 'react'
import NavButtons from './NavButtons.jsx'
import AddressBar from './AddressBar.jsx'
import ExtensionsMenu from './ExtensionsMenu.jsx'
import ProfileAvatar from './ProfileAvatar.jsx'

export default function Toolbar({
  navState,
  activeTab,
  focusSignal,
  bookmarked,
  inProgressCount,
  downloads,
  onNavigate,
  onNavAction,
  onToggleBookmark,
  onOpenPage,
  onOpenPalette,
  onOverlayChange = () => {},
  onShields,
  onSiteInfo,
  profileName,
  profileColor,
  onNewTab,
  incognito,
  settings,
  onToggleSidebar,
  sidebarActive,
  tvMode,
  onToggleTv,
  aiOpen,
  onToggleAi,
}) {
  const menuHandlersRef = useRef({})
  const openPopupRef = useRef(null)
  const suppressToggleRef = useRef(false)
  const selfClosedRef = useRef(false)
  const suppressTimerRef = useRef(null)
  const toggleMenuRef = useRef(null)
  const show = (k, def) => (settings && settings[k] !== undefined ? settings[k] : def)
  const homePage = (settings && settings.homePage) || 'nixer://newtab'

  const menuItems = [
    { icon: 'newtab', label: 'Nueva pestaña', accel: 'Ctrl+T', key: 'new-tab' },
    { icon: 'window', label: 'Nueva ventana', accel: 'Ctrl+N', key: 'new-window' },
    { icon: 'incognito', label: 'Ventana de incógnito', accel: 'Ctrl+Shift+N', key: 'new-incognito' },
    { type: 'sep' },
    { icon: 'ai', label: 'Asistente IA', accel: 'Ctrl+Alt+A', key: 'toggle-ai' },
    { icon: 'find', label: 'Paleta de comandos', accel: 'Ctrl+Shift+P', key: 'palette' },
    { type: 'sep' },
    { icon: 'history', label: 'Historial', accel: 'Ctrl+H', key: 'history' },
    { icon: 'downloads', label: 'Descargas', accel: 'Ctrl+J', key: 'downloads' },
    { icon: 'star', label: 'Marcadores', accel: 'Ctrl+Shift+O', key: 'bookmarks' },
    { type: 'sep' },
    { icon: 'settings', label: 'Ajustes', accel: 'Ctrl+,', key: 'settings' },
    { type: 'sep' },
    { icon: 'about', label: 'Acerca de Nixer', key: 'about' },
  ]

  menuHandlersRef.current = {
    'new-tab': () => onNewTab(),
    'new-window': () => window.api.createWindow(false),
    'new-incognito': () => window.api.createWindow(true),
    'toggle-ai': () => onToggleAi(),
    palette: () => onOpenPalette(),
    history: () => onOpenPage('history'),
    downloads: () => onOpenPage('downloads'),
    bookmarks: () => onOpenPage('bookmarks'),
    settings: () => onOpenPage('settings'),
    about: () => onOpenPage('about'),
  }

  useEffect(() => {
    const offs = [
      window.api.onPopupAction(({ key, data }) => {
        if (openPopupRef.current === key) openPopupRef.current = null
        if (key === 'toolbar-menu') {
          const fn = menuHandlersRef.current[data]
          if (fn) fn()
        } else if (key === 'downloads-popup') {
          if (data === 'all') onOpenPage('downloads')
          else if (data && data.startsWith('cancel:')) { const d = (downloads || [])[Number(data.slice(7))]; if (d) window.api.downloadsCancel(d.id) }
          else if (data && data.startsWith('open:')) { const d = (downloads || [])[Number(data.slice(5))]; if (d && d.path) window.api.downloadsOpen(d.path) }
          else if (data && data.startsWith('show:')) { const d = (downloads || [])[Number(data.slice(5))]; if (d && d.path) window.api.downloadsShow(d.path) }
          else if (data && data.startsWith('del:')) { const d = (downloads || [])[Number(data.slice(4))]; if (d) window.api.downloadsRemove(d.id) }
          else if (data === 'clear') window.api.downloadsClear()
        }
      }),
      window.api.onPopupClosed((key) => {
        // Solo el cierre del propio menú/descargas debe suprimir la reapertura;
        // otros popups (toasts, permisos) no deben bloquear el botón.
        if (key === 'toolbar-menu' || key === 'downloads-popup') {
          if (!selfClosedRef.current) {
            suppressToggleRef.current = true
            clearTimeout(suppressTimerRef.current)
            suppressTimerRef.current = setTimeout(() => { suppressToggleRef.current = false }, 400)
          }
          selfClosedRef.current = false
          if (openPopupRef.current === key) openPopupRef.current = null
        }
      }),
    ]
    return () => offs.forEach((o) => o && o())
  }, [downloads, onOpenPage, onNewTab, onToggleAi, onOpenPalette])

  // Mantiene el menú del navegador accesible desde la tarjeta de perfil
  // (evento 'nixer-open-menu' emitido por el avatar de perfil).
  useEffect(() => {
    toggleMenuRef.current = toggleMenu
  })
  useEffect(() => {
    const fn = () => {
      const el = document.querySelector('.profile-avatar')
      if (el && toggleMenuRef.current) toggleMenuRef.current(el)
    }
    window.addEventListener('nixer-open-menu', fn)
    return () => window.removeEventListener('nixer-open-menu', fn)
  }, [])

  function toggleMenu(btn) {
    if (suppressToggleRef.current) { suppressToggleRef.current = false; clearTimeout(suppressTimerRef.current); return }
    if (window.api.showPopup) {
      if (openPopupRef.current === 'toolbar-menu') {
        selfClosedRef.current = true
        window.api.hidePopup('toolbar-menu')
        openPopupRef.current = null
        return
      }
      const r = btn.getBoundingClientRect()
      const h = Math.min(window.innerHeight - r.bottom - 8, menuItems.length * 34 + 14)
      window.api.showPopup({
        key: 'toolbar-menu',
        x: r.right - 300,
        y: r.bottom + 6,
        width: 300,
        height: Math.max(140, h),
        payload: { type: 'menu', items: menuItems },
      })
      openPopupRef.current = 'toolbar-menu'
    }
  }

  function toggleDownloads(btn) {
    if (suppressToggleRef.current) { suppressToggleRef.current = false; clearTimeout(suppressTimerRef.current); return }
    if (window.api.showPopup) {
      if (openPopupRef.current === 'downloads-popup') {
        selfClosedRef.current = true
        window.api.hidePopup('downloads-popup')
        openPopupRef.current = null
        return
      }
      const r = btn.getBoundingClientRect()
      const list = (downloads || []).slice(0, 8)
      const h = Math.min(520, window.innerHeight - r.bottom - 8, 46 + list.length * 68 + 8)
      window.api.showPopup({
        key: 'downloads-popup',
        x: r.right - 340,
        y: r.bottom + 6,
        width: 340,
        height: Math.max(120, h),
        payload: {
          type: 'downloads',
          head: 'Descargas',
          downloads: list,
          showAll: true,
        },
      })
      openPopupRef.current = 'downloads-popup'
    }
  }

  return (
    <div className="toolbar">
      <NavButtons navState={navState} onNavAction={onNavAction} />
      {onToggleSidebar && (
        <button className={'tool-btn' + (sidebarActive ? ' active' : '')} title={'Barra lateral (Ctrl+Shift+B)'} onClick={onToggleSidebar}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 3v18" />
          </svg>
        </button>
      )}
      {show('showHomeButton', true) && (
        <button className="tool-btn" title="Inicio (Alt+Home)" onClick={() => onNavigate(homePage)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V21h14V9.5" />
          </svg>
        </button>
      )}
      <AddressBar
        url={activeTab ? activeTab.url : ''}
        internalKey={activeTab ? activeTab.internal : null}
        focusSignal={focusSignal}
        navState={navState}
        onNavigate={onNavigate}
        onNavAction={onNavAction}
        onOverlayChange={onOverlayChange}
        onShields={onShields}
        onSiteInfo={onSiteInfo}
      />
      <button
        className={'tool-btn' + (bookmarked ? ' active' : '')}
        title={bookmarked ? 'Quitar de marcadores (Ctrl+D)' : 'Añadir a marcadores (Ctrl+D)'}
        onClick={(e) => onToggleBookmark(e.currentTarget)}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <path d="M19 21l-7-4.5L5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
        </svg>
      </button>
      {show('showBookmarksBar', true) && (
        <button className="tool-btn" title={settings && settings.showBookmarksBar ? 'Ocultar barra de marcadores' : 'Mostrar barra de marcadores'} onClick={() => window.api.setSetting({ showBookmarksBar: !(settings && settings.showBookmarksBar) })}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}
      {show('showDownloadsButton', true) && (
        <button className="tool-btn" title="Descargas (Ctrl+J)" onClick={(e) => toggleDownloads(e.currentTarget)}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <path d="M7 10l5 5 5-5" />
            <path d="M12 15V3" />
          </svg>
          {inProgressCount > 0 && <span className="badge">{inProgressCount}</span>}
        </button>
      )}
      {incognito && show('showIncognitoBadge', true) && (
        <span className="incognito-chip" title="Estás navegando de incógnito: sin historial, sin sesión guardada ni contraseñas">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
          Incógnito
        </span>
      )}
      <browser-action-list className="ext-actions" />
      {onToggleAi && (
        <button className={'tool-btn ai-tool-btn' + (aiOpen ? ' active' : '')} title={'Asistente IA (Ctrl+Alt+A)'} onClick={onToggleAi}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l1.6 4.6L18 8l-4.4 1.4L12 14l-1.6-4.6L6 8l4.4-1.4z" />
            <path d="M18.5 13l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" opacity="0.7" />
            <path d="M5 14l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" opacity="0.7" />
          </svg>
        </button>
      )}
      <button className={'tool-btn tv-btn' + (tvMode ? ' active' : '')} title={tvMode ? 'Salir del modo TV (mando)' : 'Modo TV: navegar con mando'} onClick={onToggleTv}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="13" rx="2" />
          <path d="M8 2.5L12 6l4-3.5" />
        </svg>
      </button>
      {show('showExtensionsButton', true) && <ExtensionsMenu onOpenPage={onOpenPage} onOverlayChange={onOverlayChange} />}
      {show('showMenuButton', true) && <ProfileAvatar />}
    </div>
  )
}


