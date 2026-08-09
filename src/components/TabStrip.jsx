import { useEffect, useRef, useState } from 'react'
import ContextMenu from './ContextMenu.jsx'
import WindowControls from './WindowControls.jsx'
import { I } from './icons.jsx'

export default function TabStrip({ tabs, onNew, onSelect, onClose, onCloseAll, onPin, onReorder, onOverlayChange = () => {}, maximized, onNewUrl, onRestore, onGroup, splitWith, onSplit, onMute, onMoveWindow, onNewWindowUrl, closedCount, onRestoreAll, onReloadAll, onNavigateTab }) {
  const [menu, setMenu] = useState(null)
  const [manageOpen, setManageOpen] = useState(false)
  let dragId = null
  const colorSeq = useRef(0)
  const GROUP_COLORS = ['#e05252', '#d99a2b', '#3da26e', '#4a7bd0', '#8b5cf6', '#c4458c']

  useEffect(() => {
    onOverlayChange(!!menu || manageOpen)
  }, [menu, manageOpen, onOverlayChange])

  useEffect(() => {
    function close(e) {
      if (!e.target.closest('.tab-manage, .tab-manage-menu')) setManageOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [])

  const activeTab = tabs.find((t) => t.active)
  const activeIdx = activeTab ? tabs.indexOf(activeTab) : -1

  function closeOthers() {
    tabs.forEach((t) => { if (!t.active) onClose(t.id) })
    setManageOpen(false)
  }

  function closeToRight() {
    if (activeIdx < 0) return
    tabs.forEach((t, i) => { if (i > activeIdx) onClose(t.id) })
    setManageOpen(false)
  }

  function closeAll() {
    if (onCloseAll) onCloseAll()
    else tabs.forEach((t) => onClose(t.id))
    setManageOpen(false)
  }

  function startDrag(e, id) {
    if (e.button !== 0) return
    dragId = id
    e.currentTarget.classList.add('dragging')
  }

  function handleMove(e) {
    if (!dragId) return
    const el = document.elementFromPoint(e.clientX, e.clientY)
    const target = el ? el.closest('.tab') : null
    if (!target) return
    const targetId = target.dataset.id
    if (String(targetId) === String(dragId)) return
    onReorder(dragId, targetId)
  }

  function endDrag(e) {
    if (dragId) {
      const el = e.currentTarget.querySelector('.dragging')
      if (el) el.classList.remove('dragging')
    }
    dragId = null
  }

  function openMenu(e, tab) {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, tab })
  }

  const groups = Array.from(new Map(tabs.filter((t) => t.group).map((t) => [t.group.id, t.group])).values())

  const menuItems = menu
    ? [
        { icon: I.plus, label: 'Nueva pestaña', accel: 'Ctrl+T', action: () => onNew() },
        { sep: true },
        { icon: I.window, label: splitWith ? 'Salir de la vista dividida' : 'Ver en vista dividida', action: () => { onSplit(menu.tab.id); setMenu(null) } },
        ...(menu.tab.group
          ? [{ icon: I.pin, label: 'Quitar del grupo', action: () => { onGroup(menu.tab.id, null); setMenu(null) } }]
          : []),
        { icon: I.volume, label: menu.tab.muted ? 'Reactivar sonido' : 'Silenciar pestaña', action: () => { onMute(menu.tab.id); setMenu(null) } },
        { icon: I.window, label: 'Mover a nueva ventana', action: () => { onMoveWindow(menu.tab.id); setMenu(null) } },
        { icon: I.window, label: 'Duplicar en ventana nueva', action: () => { onNewWindowUrl(menu.tab.url); setMenu(null) } },
        ...groups.filter((g) => !menu.tab.group || g.id !== menu.tab.group.id).map((g) => ({
          icon: <span className="menu-color-dot" style={{ background: g.color }} />,
          label: 'Añadir al grupo: ' + g.label,
          action: () => { onGroup(menu.tab.id, g); setMenu(null) },
        })),
        {
          icon: I.plus,
          label: 'Crear nuevo grupo',
          action: () => {
            const c = GROUP_COLORS[colorSeq.current++ % GROUP_COLORS.length]
            onGroup(menu.tab.id, { id: 'g' + Date.now(), label: (menu.tab.title || 'Grupo').slice(0, 14), color: c })
            setMenu(null)
          },
        },
        { sep: true },
        { icon: I.pin, label: menu.tab.pinned ? 'Desfijar pestaña' : 'Fijar pestaña', action: () => onPin(menu.tab.id) },
        { icon: I.copy, label: 'Duplicar pestaña', action: () => onNewUrl(menu.tab.url) },
        { icon: I.restore, label: 'Reabrir pestaña cerrada', accel: 'Ctrl+Shift+T', action: () => onRestore() },
        { sep: true },
        { icon: I.close, label: 'Cerrar pestaña', accel: 'Ctrl+W', action: () => onClose(menu.tab.id), danger: true },
      ]
    : []

  return (
    <div className="tab-strip" onMouseMove={handleMove} onMouseUp={endDrag} onDoubleClick={(e) => { if (!e.target.closest('.tab')) onNew() }}>
      <div className="tab-list">
        {tabs.map((t) => (
          <div
            key={t.id}
            data-id={t.id}
            className={'tab' + (t.active ? ' active' : '') + (t.pinned ? ' pinned' : '')}
            onClick={() => onSelect(t.id)}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault()
                onClose(t.id)
              } else {
                startDrag(e, t.id)
              }
            }}
            onContextMenu={(e) => openMenu(e, t)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
              if (url && /^https?:/.test(url.trim()) && onNavigateTab) onNavigateTab(t.id, url.trim())
            }}
            title={t.title || 'Nueva pestaña'}
          >
            {t.group && <span className="tab-group-stripe" style={{ background: t.group.color }} />}
            {t.group && <span className="tab-group-label" style={{ background: t.group.color }}>{t.group.label.slice(0, 1).toUpperCase()}</span>}
            {t.favicon ? (
              <img className="favicon" src={t.favicon} alt="" />
            ) : (
              <span className="favicon globe" />
            )}
            {!t.pinned && <span className="tab-title">{t.title || 'Nueva pestaña'}</span>}
            {(t.audible || t.muted) && (
              <button className={'tab-audio' + (t.muted ? ' muted' : '')} title={t.muted ? 'Silenciado (clic para reactivar)' : 'Reproduciendo audio'} onClick={(e) => { e.stopPropagation(); onMute(t.id) }}>
                {t.muted ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M22 9l-6 6M16 9l6 6"/></svg>
                ) : (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"/></svg>
                )}
              </button>
            )}
            {!t.pinned && (
              <button
                className="tab-close"
                title="Cerrar pestaña (Ctrl+W)"
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(t.id)
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}
        <button className="new-tab" title="Nueva pestaña (Ctrl+T)" onClick={onNew}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        {closedCount > 0 && (
          <button className="restore-tab" title={'Reabrir pestaña cerrada (' + closedCount + ') · Ctrl+Shift+T'} onClick={onRestore}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        )}
      </div>
      <div className="tab-manage-wrap">
          <button className={'tab-manage' + (manageOpen ? ' active' : '')} title="Manejar pestañas" onClick={() => setManageOpen((o) => !o)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M3 9h18M9 9v11" />
            </svg>
          </button>
          {manageOpen && (
            <div className="tab-manage-menu">
              <div className="tm-head">
                <span>Pestañas ({tabs.length})</span>
                <button className="tm-link" onClick={() => { setManageOpen(false); onNew() }}>+ Nueva</button>
              </div>
              <div className="tm-list">
                {tabs.map((t) => (
                  <div key={t.id} className={'tm-tab' + (t.active ? ' active' : '')} onClick={() => { setManageOpen(false); onSelect(t.id) }} title={t.title || 'Nueva pestaña'}>
                    {t.favicon ? <img className="favicon" src={t.favicon} alt="" /> : <span className="favicon globe" />}
                    <span className="tm-title">{t.title || 'Nueva pestaña'}</span>
                    <button className="tm-close" title="Cerrar" onClick={(e) => { e.stopPropagation(); onClose(t.id) }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                ))}
              </div>
              <div className="tm-actions">
                <button className="tm-action" onClick={() => { setManageOpen(false); onNew() }}>Nueva pestaña</button>
                <button className="tm-action" onClick={() => { setManageOpen(false); onSplit(activeTab && activeTab.id) }}>
                  {splitWith ? 'Salir de la vista dividida' : 'Dividir pantalla'}
                </button>
                <button className="tm-action" onClick={() => { setManageOpen(false); onRestoreAll && onRestoreAll() }} disabled={!closedCount}>Reabrir todas las cerradas</button>
                <button className="tm-action" onClick={() => { setManageOpen(false); onReloadAll && onReloadAll() }}>Recargar todas las pestañas</button>
                <button className="tm-action" onClick={closeOthers} disabled={tabs.length < 2}>Cerrar otras pestañas</button>
                <button className="tm-action" onClick={closeToRight} disabled={activeIdx < 0 || activeIdx === tabs.length - 1}>Cerrar pestañas a la derecha</button>
                <button className="tm-action danger" onClick={closeAll} disabled={tabs.length === 0}>Cerrar todas las pestañas</button>
              </div>
            </div>
          )}
        </div>
      <WindowControls maximized={maximized} />
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      )}
    </div>
  )
}

