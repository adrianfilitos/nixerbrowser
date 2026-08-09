import { useEffect, useRef, useState } from 'react'
import NavButtons from './NavButtons.jsx'
import AddressBar from './AddressBar.jsx'
import ExtensionsMenu from './ExtensionsMenu.jsx'
import { I } from './icons.jsx'

export default function Toolbar({
  navState,
  activeTab,
  focusSignal,
  bookmarked,
  inProgressCount,
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
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const show = (k, def) => (settings && settings[k] !== undefined ? settings[k] : def)
  const homePage = (settings && settings.homePage) || 'nixer://newtab'

  useEffect(() => {
    onOverlayChange(menuOpen)
  }, [menuOpen, onOverlayChange])

  useEffect(() => {
    function close(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [])

  const menuItems = [
    { icon: I.plus, label: 'Nueva pestaña', accel: 'Ctrl+T', action: () => onNewTab() },
    { icon: I.window, label: 'Nueva ventana', accel: 'Ctrl+N', action: () => window.api.createWindow(false) },
    { icon: I.incognito, label: 'Ventana de incógnito', accel: 'Ctrl+Shift+N', action: () => window.api.createWindow(true) },
    { type: 'sep' },
    { icon: I.ai, label: 'Asistente IA', accel: 'Ctrl+Alt+A', action: () => onOpenPage('ai') },
    { icon: I.find, label: 'Paleta de comandos', accel: 'Ctrl+Shift+P', action: () => onOpenPalette() },
    { type: 'sep' },
    { icon: I.history, label: 'Historial', accel: 'Ctrl+H', action: () => onOpenPage('history') },
    { icon: I.downloads, label: 'Descargas', accel: 'Ctrl+J', action: () => onOpenPage('downloads') },
    { icon: I.star, label: 'Marcadores', accel: 'Ctrl+Shift+O', action: () => onOpenPage('bookmarks') },
    { type: 'sep' },
    { icon: I.settings, label: 'Ajustes', accel: 'Ctrl+,', action: () => onOpenPage('settings') },
    { type: 'sep' },
    { icon: I.ai, label: 'Acerca de Nixer', action: () => onOpenPage('about') },
  ]

  return (
    <div className="toolbar">
      <NavButtons navState={navState} onNavAction={onNavAction} />
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
        onClick={onToggleBookmark}
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
        <button className="tool-btn" title="Descargas (Ctrl+J)" onClick={() => onOpenPage('downloads')}>
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
      {show('showExtensionsButton', true) && <ExtensionsMenu onOpenPage={onOpenPage} />}
      {show('showMenuButton', true) && (
      <div className="menu-wrap" ref={menuRef}>
        <button className="menu-btn" title="Menú" onClick={() => setMenuOpen((o) => !o)}>
          <span className="menu-avatar" style={{ background: profileColor || 'var(--accent)' }}>
            {profileName ? profileName.slice(0, 1).toUpperCase() : 'N'}
          </span>
          <span>Menú</span>
        </button>
        {menuOpen && (
          <div className="dropdown">
            <div className="drop-profile">
              <span className="drop-avatar" style={{ background: profileColor || 'var(--accent)' }}>
                {profileName ? profileName.slice(0, 1).toUpperCase() : 'N'}
              </span>
              <div className="drop-profile-info">
                <b>{profileName || 'Perfil'}</b>
                <span>Nixer Browser</span>
              </div>
            </div>
            <div className="drop-sep" />
            {menuItems.map((m, i) =>
              m.type === 'sep' ? (
                <div key={i} className="drop-sep" />
              ) : (
                <button key={i} className="drop-item" onClick={() => { setMenuOpen(false); m.action() }}>
                  <span className="drop-left">
                    <span className="drop-icon">{m.icon}</span>
                    <span>{m.label}</span>
                  </span>
                  <span className="accel">{m.accel}</span>
                </button>
              )
            )}
            <div className="drop-sep" />
            <button className="drop-item" onClick={() => { setMenuOpen(false); onOpenPage('welcome') }}>
              <span className="drop-left">
                <span className="drop-icon">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="8" r="3.5" />
                    <path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" />
                  </svg>
                </span>
                <span>Cambiar perfil</span>
              </span>
            </button>
          </div>
        )}
      </div>
      )}
    </div>
  )
}

