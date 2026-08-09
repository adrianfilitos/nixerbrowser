import { useEffect, useState } from 'react'
import ContextMenu from './ContextMenu.jsx'
import WindowControls from './WindowControls.jsx'
import { I } from './icons.jsx'

export default function TabStrip({ tabs, onNew, onSelect, onClose, onCloseAll, onPin, onReorder, onOverlayChange = () => {}, maximized, onNewUrl, onRestore }) {
  const [menu, setMenu] = useState(null)
  const [manageOpen, setManageOpen] = useState(false)
  let dragId = null

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

  const menuItems = menu
    ? [
        { icon: I.plus, label: 'Nueva pestaña', accel: 'Ctrl+T', action: () => onNew() },
        { sep: true },
        { icon: I.pin, label: menu.tab.pinned ? 'Desfijar pestaña' : 'Fijar pestaña', action: () => onPin(menu.tab.id) },
        { icon: I.copy, label: 'Duplicar pestaña', action: () => onNewUrl(menu.tab.url) },
        { icon: I.restore, label: 'Reabrir pestaña cerrada', accel: 'Ctrl+Shift+T', action: () => onRestore() },
        { sep: true },
        { icon: I.close, label: 'Cerrar pestaña', accel: 'Ctrl+W', action: () => onClose(menu.tab.id), danger: true },
      ]
    : []

  return (
    <div className="tab-strip" onMouseMove={handleMove} onMouseUp={endDrag}>
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
            title={t.title || 'Nueva pestaña'}
          >
            {t.favicon ? (
              <img className="favicon" src={t.favicon} alt="" />
            ) : (
              <span className="favicon globe" />
            )}
            {!t.pinned && <span className="tab-title">{t.title || 'Nueva pestaña'}</span>}
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

