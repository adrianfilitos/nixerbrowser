import { useEffect, useRef, useState } from 'react'
import WindowControls from './WindowControls.jsx'

export default function TabStrip({ tabs, onNew, onSelect, onClose, onCloseAll, onPin, onReorder, onOverlayChange = () => {}, maximized, onNewUrl, onRestore, onGroup, splitWith, onSplit, onMute, onMoveWindow, onNewWindowUrl, closedCount, closedTabs, onRestoreAll, onReloadAll, onNavigateTab, onRename, onMove, onCloseLeft, onDetach, windowId, onRestoreId }) {
  const [renamingId, setRenamingId] = useState(null)
  const [renameVal, setRenameVal] = useState('')
  const [draggingId, setDraggingId] = useState(null)
  const [crowded, setCrowded] = useState(false)
  const colorSeq = useRef(0)
  const GROUP_COLORS = ['#e05252', '#d99a2b', '#3da26e', '#4a7bd0', '#8b5cf6', '#c4458c']

  const openPopupRef = useRef(null)
  const menuCtxRef = useRef(null)
  const suppressToggleRef = useRef(false)
  const selfClosedRef = useRef(false)
  const suppressTimerRef = useRef(null)
  const listRef = useRef(null)

  function popupSuppressed() {
    if (suppressToggleRef.current) {
      suppressToggleRef.current = false
      clearTimeout(suppressTimerRef.current)
      return true
    }
    return false
  }

  function togglePopup(btn, key, makePopup) {
    if (popupSuppressed()) return
    if (openPopupRef.current === key) {
      selfClosedRef.current = true
      window.api.hidePopup(key)
      openPopupRef.current = null
      return
    }
    makePopup(btn)
  }

  function showManagePopup(btn) {
    if (!window.api.showPopup) return
    const items = []
    tabs.forEach((t) => {
      items.push({ label: t.title || 'Nueva pestaña', sublabel: t.url || '', key: 'select:' + t.id })
    })
    items.push({ type: 'sep' })
    items.push({ label: 'Nueva pestaña', key: 'new' })
    items.push({ label: splitWith ? 'Salir de la vista dividida' : 'Dividir pantalla', key: 'split' })
    items.push({ label: 'Reabrir todas las cerradas', key: 'restore-all', enabled: closedCount > 0 })
    items.push({ label: 'Recargar todas', key: 'reload-all' })
    items.push({ label: 'Cerrar otras pestañas', key: 'close-others', enabled: tabs.length > 1 })
    items.push({ label: 'Cerrar todas', key: 'close-all', danger: true })
    const r = btn.getBoundingClientRect()
    window.api.showPopup({
      key: 'tab-manage',
      x: r.right - 320,
      y: r.bottom + 6,
      width: 320,
      height: Math.min(window.innerHeight - r.bottom - 8, items.length * 32 + 14),
      payload: { type: 'menu', items },
    })
    openPopupRef.current = 'tab-manage'
  }

  function showRestorePopup(btn) {
    if (!window.api.showPopup) return
    const items = closedTabs.length
      ? closedTabs.map((t) => ({ label: t.title || t.url, sublabel: t.url, key: 'restore:' + t.id }))
      : [{ label: 'No hay pestañas cerradas', key: '__none', enabled: false }]
    if (closedTabs.length) items.push({ type: 'sep' }, { label: 'Restaurar todas', key: 'restore-all' })
    const r = btn.getBoundingClientRect()
    window.api.showPopup({
      key: 'tab-restore',
      x: r.right - 340,
      y: r.bottom + 6,
      width: 340,
      height: Math.min(window.innerHeight - r.bottom - 8, items.length * 32 + 14),
      payload: { type: 'menu', items },
    })
    openPopupRef.current = 'tab-restore'
  }

  useEffect(() => {
    const offs = [
      window.api.onPopupAction(({ key, data }) => {
        if (openPopupRef.current === key) openPopupRef.current = null
        if (key === 'tab-manage') {
          if (data === 'new') onNew()
          else if (data === 'split') onSplit(activeTab ? activeTab.id : null)
          else if (data === 'restore-all') { if (onRestoreAll) onRestoreAll() }
          else if (data === 'reload-all') { if (onReloadAll) onReloadAll() }
          else if (data === 'close-others') closeOthers()
          else if (data === 'close-all') closeAll()
          else if (data && data.startsWith('select:')) onSelect(String(data.slice(7)))
        } else if (key === 'tab-restore') {
          if (data === 'restore-all') { if (onRestoreAll) onRestoreAll() }
          else if (data && data.startsWith('restore:')) { if (onRestoreId) onRestoreId(String(data.slice(8))) }
        } else if (key === 'tab-ctx') {
          handleMenuAction(data)
        }
      }),
      window.api.onPopupClosed((key) => {
        // Solo los popups propios (manejar/restaurar/contexto) suprimen reapertura.
        if (key === 'tab-manage' || key === 'tab-restore' || key === 'tab-ctx') {
          if (!selfClosedRef.current) {
            suppressToggleRef.current = true
            clearTimeout(suppressTimerRef.current)
            suppressTimerRef.current = setTimeout(() => { suppressToggleRef.current = false }, 400)
          }
          selfClosedRef.current = false
        }
        if (openPopupRef.current === key) openPopupRef.current = null
      }),
    ]
    return () => offs.forEach((o) => o && o())
  })

  const activeTab = tabs.find((t) => t.active)

  // Compactación: cuando el listado desborda, las pestañas se fuerzan a un ancho
  // compacto (clase .crowded + .narrow solo-favicon) independientemente del
  // ajuste --tab-min-width del perfil.
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const apply = () => {
      setCrowded(list.scrollWidth > list.clientWidth + 4)
      for (const el of list.querySelectorAll('.tab')) {
        el.classList.toggle('narrow', el.getBoundingClientRect().width < 92)
      }
    }
    apply()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(apply)
    ro.observe(list)
    return () => ro.disconnect()
  }, [tabs])

  // Auto-scroll: mantiene visible la pestaña activa cuando se cambia o se añade
  // fuera de la vista (scroll "nearest": solo si está fuera del contenedor).
  // Se ejecuta en rAF para que el layout ya esté asentado; se omite durante drag.
  useEffect(() => {
    if (draggingId) return
    const id = activeTab ? activeTab.id : null
    if (!id) return
    const raf = requestAnimationFrame(() => {
      const list = listRef.current
      if (!list) return
      const el = list.querySelector('.tab.active')
      if (!el) return
      const lr = list.getBoundingClientRect()
      const er = el.getBoundingClientRect()
      if (er.left < lr.left) list.scrollLeft += er.left - lr.left
      else if (er.right > lr.right) list.scrollLeft += er.right - lr.right
    })
    return () => cancelAnimationFrame(raf)
  }, [activeTab ? activeTab.id : null, draggingId, tabs.length])

  function closeOthers() {
    tabs.forEach((t) => { if (!t.active) onClose(t.id) })
  }

  function closeAll() {
    if (onCloseAll) onCloseAll()
    else tabs.forEach((t) => onClose(t.id))
  }

  const suppressClickRef = useRef(false)
  const dragIdRef = useRef(null)
  const indicatorRef = useRef(null)
  const dropIdxRef = useRef(null)
  const lastDropIdxRef = useRef(null)
  const droppedRef = useRef(false)
  const dragWidthRef = useRef(0)
  const reorderFnRef = useRef(onReorder)
  reorderFnRef.current = onReorder
  const TEAROFF_OFFSET = 60

  function resetTransforms() {
    dropIdxRef.current = null
    const els = document.querySelectorAll('.tab-list .tab')
    for (const el of els) {
      el.style.transform = ''
      el.style.opacity = ''
      el.style.transition = ''
    }
  }

  function removeIndicator() {
    if (indicatorRef.current) { indicatorRef.current.remove(); indicatorRef.current = null }
  }

  function cleanupDrag() {
    removeIndicator()
    resetTransforms()
    dragIdRef.current = null
    lastDropIdxRef.current = null
    droppedRef.current = false
    suppressClickRef.current = false
    setDraggingId(null)
    try { window.__nixerDragging = false } catch {}
  }

  // Reorder SOLO visual durante el arrastre: las pestañas se deslizan con
  // transform (compositor GPU, sin tocar el estado de React). Solo se aplica
  // cuando el índice de inserción cambia → el strip no hace trabajo por frame.
  function applyTransforms(drop) {
    const id = dragIdRef.current
    if (!id) return
    const els = Array.from(document.querySelectorAll('.tab-list .tab'))
    const from = els.findIndex((el) => String(el.dataset.id) === String(id))
    for (let i = 0; i < els.length; i++) {
      const el = els[i]
      if (i === from) { el.style.opacity = '0'; el.style.transform = ''; continue }
      let dx = 0
      if (drop !== null) {
        if (drop <= from && i >= drop && i < from) dx = dragWidthRef.current
        else if (drop > from && i > from && i <= drop) dx = -dragWidthRef.current
      }
      el.style.opacity = ''
      el.style.transform = dx ? 'translateX(' + Math.round(dx) + 'px)' : ''
    }
  }

  function placeIndicator(T) {
    const id = dragIdRef.current
    const ind = indicatorRef.current
    if (!id || !ind) return
    const els = Array.from(document.querySelectorAll('.tab-list .tab'))
    const cur = els.findIndex((el) => String(el.dataset.id) === String(id))
    if (cur < 0 || !els.length || T === cur || T === cur + 1) { ind.style.opacity = '0'; return }
    let left
    if (T > cur) {
      if (T >= els.length) left = els[els.length - 1].getBoundingClientRect().right
      else left = els[T].getBoundingClientRect().left
    } else {
      left = els[T].getBoundingClientRect().left
    }
    const listEl = document.querySelector('.tab-list')
    const listRect = listEl ? listEl.getBoundingClientRect() : { top: 0, height: 0 }
    ind.style.opacity = '1'
    ind.style.transform = 'translate3d(' + Math.round(left - 1.5) + 'px,' + Math.round(listRect.top) + 'px,0)'
    ind.style.height = Math.round(listRect.height) + 'px'
  }

  // Drag nativo HTML5: el SO renderiza el ghost con setDragImage → sin retardo,
  // y el reorder se confirma una sola vez en el drop.
  function onTabDragStart(e, t) {
    if (e.target.closest && e.target.closest('.tab-close, .tab-audio, .tab-rename')) { e.preventDefault(); return }
    if (t.pinned) { e.preventDefault(); return }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/x-nixer-tab', String(t.id))
    if (t.url) {
      e.dataTransfer.setData('text/plain', t.url)
      e.dataTransfer.setData('text/uri-list', t.url)
    }
    const el = document.querySelector('.tab-list .tab[data-id="' + t.id + '"]')
    if (el) {
      const r = el.getBoundingClientRect()
      dragWidthRef.current = r.width
      const snap = el.cloneNode(true)
      snap.className = 'tab tab-drag-ghost'
      snap.style.width = r.width + 'px'
      snap.style.height = r.height + 'px'
      snap.style.position = 'fixed'
      snap.style.left = '-9999px'
      snap.style.top = '0'
      snap.style.pointerEvents = 'none'
      document.body.appendChild(snap)
      try { e.dataTransfer.setDragImage(snap, Math.max(0, Math.round(e.clientX - r.left)), Math.max(0, Math.round(e.clientY - r.top))) } catch {}
      setTimeout(() => { if (snap && snap.parentNode) snap.remove() }, 0)
      el.style.opacity = '0'
      // Transición UNA sola vez: se anima solo cuando el índice de inserción cambia.
      const siblings = document.querySelectorAll('.tab-list .tab')
      for (const s of siblings) s.style.transition = 'transform 140ms ease'
    }
    if (!indicatorRef.current) {
      const ind = document.createElement('div')
      ind.className = 'tab-drop-indicator'
      document.body.appendChild(ind)
      indicatorRef.current = ind
    }
    dragIdRef.current = t.id
    lastDropIdxRef.current = null
    dropIdxRef.current = null
    droppedRef.current = false
    suppressClickRef.current = true
    setDraggingId(t.id)
    try { window.__nixerDragging = true } catch {}
    if (window.api.dragStart) window.api.dragStart({ tabId: t.id, url: t.url, title: t.title })
  }

  function commitReorder(fromId) {
    const els = Array.from(document.querySelectorAll('.tab-list .tab'))
    const cur = els.findIndex((el) => String(el.dataset.id) === String(fromId))
    const T = dropIdxRef.current
    if (cur < 0 || T === null || T === cur || T === cur + 1) return
    let toId = null
    if (T >= els.length) toId = els.length ? els[els.length - 1].dataset.id : null
    else toId = els[T] ? els[T].dataset.id : null
    if (toId && String(toId) !== String(fromId)) reorderFnRef.current(String(fromId), String(toId))
  }

  function onStripDragOver(e) {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    const id = dragIdRef.current
    if (!id) return
    const els = Array.from(document.querySelectorAll('.tab-list .tab'))
    const cur = els.findIndex((el) => String(el.dataset.id) === String(id))
    if (cur < 0 || !els.length) return
    let T = 0
    for (let i = 0; i < els.length; i++) {
      const r = els[i].getBoundingClientRect()
      if (e.clientX < r.left + r.width / 2) { T = i; break }
      T = i + 1
    }
    if (T === lastDropIdxRef.current) return
    lastDropIdxRef.current = T
    dropIdxRef.current = T
    placeIndicator(T)
    applyTransforms(T)
  }

  function onStripDrop(e) {
    e.preventDefault()
    const fromId = e.dataTransfer ? e.dataTransfer.getData('application/x-nixer-tab') : ''
    if (fromId) {
      droppedRef.current = true
      commitReorder(fromId)
      cleanupDrag()
      try { window.dispatchEvent(new CustomEvent('nixer-drag-end')) } catch {}
      return
    }
    const url = (e.dataTransfer && (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain'))) || ''
    const target = document.elementFromPoint(e.clientX, e.clientY)
    const tabEl = target && target.closest ? target.closest('.tab') : null
    if (url && /^https?:/.test(url.trim()) && tabEl && tabEl.dataset.id && onNavigateTab) {
      onNavigateTab(tabEl.dataset.id, url.trim())
    }
    cleanupDrag()
  }

  function onTabDragEnd(e) {
    const id = dragIdRef.current
    if (!id) { cleanupDrag(); return }
    const strip = document.querySelector('.tab-strip')
    const rect = strip ? strip.getBoundingClientRect() : null
    const x = e.clientX
    const y = e.clientY
    const outside = !rect || y > rect.bottom + TEAROFF_OFFSET || x < rect.left - 60 || x > rect.right + 60
    if (!outside && !droppedRef.current) {
      // En drags nativos el 'drop' a veces no llega al strip: confirma el insert aquí.
      commitReorder(String(id))
    }
    cleanupDrag()
    try { window.dispatchEvent(new CustomEvent('nixer-drag-end')) } catch {}
    if (outside && window.api.dragDrop) {
      // Deja que main decida: si el cursor está sobre OTRA ventana -> acopla la
      // pestaña (dock); si no -> crea una ventana nueva (tear-off).
      try { window.api.dragDrop(e.screenX, e.screenY) } catch {}
    }
  }

  function onMouseDown(e, t) {
    if (e.button === 1) {
      e.preventDefault()
      onClose(t.id)
      return
    }
  }

  function openMenu(e, tab) {
    e.preventDefault()
    menuCtxRef.current = tab
    const groups = Array.from(new Map(tabs.filter((t) => t.group).map((t) => [t.group.id, t.group])).values())
    const items = [
      { icon: 'newtab', label: 'Nueva pestaña', accel: 'Ctrl+T', key: 'new' },
      { type: 'sep' },
      { icon: 'window', label: splitWith ? 'Salir de la vista dividida' : 'Ver en vista dividida', key: 'split' },
      ...(tab.group ? [{ icon: 'pin', label: 'Quitar del grupo', key: 'ungroup' }] : []),
      { icon: 'volume', label: tab.muted ? 'Reactivar sonido' : 'Silenciar pestaña', key: 'mute' },
      { icon: 'form', label: 'Renombrar pestaña', accel: 'F2', key: 'rename' },
      { icon: 'window', label: 'Mover a nueva ventana', key: 'move-window' },
      { icon: 'window', label: 'Duplicar en ventana nueva', key: 'dup-window' },
      { icon: 'arrow', label: 'Mover a la izquierda', accel: 'Alt+←', key: 'move-left' },
      { icon: 'arrow', label: 'Mover a la derecha', accel: 'Alt+→', key: 'move-right' },
      { icon: 'close', label: 'Cerrar pestañas a la izquierda', key: 'close-left', danger: true },
      ...groups.filter((g) => !tab.group || g.id !== tab.group.id).map((g) => ({
        icon: 'color', dotColor: g.color,
        label: 'Añadir al grupo: ' + g.label,
        key: 'add-group:' + g.id,
      })),
      { icon: 'color', label: 'Crear nuevo grupo', key: 'new-group' },
      { type: 'sep' },
      { icon: 'pin', label: tab.pinned ? 'Desfijar pestaña' : 'Fijar pestaña', key: 'pin' },
      { icon: 'copy', label: 'Duplicar pestaña', key: 'dup' },
      { icon: 'restore', label: 'Reabrir pestaña cerrada', accel: 'Ctrl+Shift+T', key: 'restore' },
      { type: 'sep' },
      { icon: 'close', label: 'Cerrar pestaña', accel: 'Ctrl+W', key: 'close', danger: true },
    ]
    const h = Math.min(window.innerHeight - e.clientY - 8, items.length * 34 + 14)
    window.api.showPopup({
      key: 'tab-ctx',
      x: e.clientX,
      y: e.clientY,
      width: 270,
      height: Math.max(160, h),
      payload: { type: 'menu', items },
    })
    openPopupRef.current = 'tab-ctx'
  }

  function handleMenuAction(key) {
    const tab = menuCtxRef.current
    if (!tab) return
    const groups = Array.from(new Map(tabs.filter((t) => t.group).map((t) => [t.group.id, t.group])).values())
    switch (key) {
      case 'new': onNew(); break
      case 'split': onSplit(tab.id); break
      case 'ungroup': onGroup(tab.id, null); break
      case 'mute': onMute(tab.id); break
      case 'rename': setRenameVal(tab.title || ''); setRenamingId(tab.id); break
      case 'move-window': onMoveWindow(tab.id); break
      case 'dup-window': if (tab.url) onNewWindowUrl(tab.url); break
      case 'move-left': onMove(tab.id, -1); break
      case 'move-right': onMove(tab.id, 1); break
      case 'close-left': onCloseLeft(tab.id); break
      case 'pin': onPin(tab.id); break
      case 'dup': if (tab.url) onNewUrl(tab.url); break
      case 'restore': onRestore(); break
      case 'close': onClose(tab.id); break
      case 'new-group': {
        const c = GROUP_COLORS[colorSeq.current++ % GROUP_COLORS.length]
        onGroup(tab.id, { id: 'g' + Date.now(), label: (tab.title || 'Grupo').slice(0, 14), color: c })
        break
      }
      default:
        if (key && key.startsWith('add-group:')) {
          const gid = key.slice(10)
          const g = groups.find((x) => x.id === gid)
          if (g) onGroup(tab.id, g)
        }
    }
    menuCtxRef.current = null
  }

  return (
    <div className={'tab-strip' + (crowded ? ' crowded' : '')} onDoubleClick={(e) => { if (!e.target.closest('.tab')) onNew() }}>
      <div className="tab-list" ref={listRef} onDragOver={onStripDragOver} onDrop={onStripDrop}>
        {tabs.map((t) => (
          <div
            key={t.id}
            data-id={t.id}
            draggable
            className={'tab' + (t.active ? ' active' : '') + (t.pinned ? ' pinned' : '') + (draggingId === t.id ? ' dragging' : '')}
            onDragStart={(e) => onTabDragStart(e, t)}
            onDragEnd={onTabDragEnd}
            onClick={(e) => {
              if (suppressClickRef.current) { suppressClickRef.current = false; e.preventDefault(); return }
              onSelect(t.id)
            }}
            onMouseDown={(e) => onMouseDown(e, t)}
            onContextMenu={(e) => openMenu(e, t)}
            onDoubleClick={(e) => { e.stopPropagation(); if (!t.pinned) { setRenameVal(t.title || ''); setRenamingId(t.id) } }}
            onKeyDown={(e) => {
              if (renamingId === t.id) {
                if (e.key === 'Enter') { onRename(t.id, renameVal.trim() || t.title); setRenamingId(null) }
                else if (e.key === 'Escape') setRenamingId(null)
              }
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
            {renamingId === t.id ? (
              <input className="tab-rename" value={renameVal} autoFocus onChange={(e) => setRenameVal(e.target.value)} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => {
                if (e.key === 'Enter') { onRename(t.id, renameVal.trim() || t.title); setRenamingId(null) }
                else if (e.key === 'Escape') setRenamingId(null)
              }} />
            ) : (
              <span className="tab-title">{t.title || 'Nueva pestaña'}</span>
            )}
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
      </div>
      {closedCount > 0 && (
        <div className="restore-wrap">
          <button className="restore-tab" title={'Reabrir pestaña cerrada (' + closedCount + ') · Ctrl+Shift+T'} onClick={(e) => togglePopup(e.currentTarget, 'tab-restore', showRestorePopup)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            <span className="restore-count">{closedCount}</span>
          </button>
        </div>
      )}
      <div className="tab-strip-drag" />
      <div className="tab-manage-wrap">
          <button className="tab-manage" title="Manejar pestañas" onClick={(e) => togglePopup(e.currentTarget, 'tab-manage', showManagePopup)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M3 9h18M9 9v11" />
            </svg>
          </button>
        </div>
      <WindowControls maximized={maximized} />
    </div>
  )
}

