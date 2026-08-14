import { useEffect, useRef, useState } from 'react'

export default function ExtensionsMenu({ onOpenPage, onOverlayChange }) {
  const [exts, setExts] = useState([])
  const extsRef = useRef([])
  extsRef.current = exts
  const openPopupRef = useRef(null)
  const suppressRef = useRef(false)
  const selfClosedRef = useRef(false)
  const suppressTimerRef = useRef(null)
  const KEY = 'ext-menu'

  function refresh() {
    window.api.extensionsList().then(setExts)
  }

  function openMenu(btn) {
    if (suppressRef.current) { suppressRef.current = false; clearTimeout(suppressTimerRef.current); return }
    if (openPopupRef.current === KEY) {
      selfClosedRef.current = true
      window.api.hidePopup(KEY)
      openPopupRef.current = null
      return
    }
    refresh()
    setTimeout(() => show(btn), 120)
  }

  function show(btn) {
    if (!window.api.showPopup || openPopupRef.current === KEY) return
    const items = extsRef.current.length
      ? extsRef.current.map((e) => ({
          label: e.name + (e.enabled ? '  ✓' : ''),
          sublabel: 'v' + e.version + (e.enabled ? ' · activa' : ' · desactivada'),
          key: 'toggle:' + e.id,
        }))
      : [{ label: 'Ninguna extensión instalada', key: '__none', enabled: false }]
    items.push({ type: 'sep' }, { label: 'Gestionar / añadir extensiones…', key: 'manage' })
    const r = btn.getBoundingClientRect()
    window.api.showPopup({
      key: KEY,
      x: r.right - 300,
      y: r.bottom + 6,
      width: 300,
      height: Math.min(window.innerHeight - r.bottom - 8, items.length * 34 + 14),
      payload: { type: 'menu', items },
    })
    openPopupRef.current = KEY
  }

  useEffect(() => {
    const offs = [
      window.api.onPopupAction(({ key, data }) => {
        if (openPopupRef.current === key) openPopupRef.current = null
        if (key !== KEY) return
        if (data === 'manage') { onOpenPage('extensions'); return }
        if (data && data.startsWith('toggle:')) {
          const id = data.slice(7)
          const e = extsRef.current.find((x) => x.id === id)
          if (e) window.api.extensionsSetEnabled(id, !e.enabled).then(() => {
            refresh()
            const items = extsRef.current.map((x) => ({
              label: x.name + (x.enabled ? '  ✓' : ''),
              sublabel: 'v' + x.version + (x.enabled ? ' · activa' : ' · desactivada'),
              key: 'toggle:' + x.id,
            }))
            items.push({ type: 'sep' }, { label: 'Gestionar / añadir extensiones…', key: 'manage' })
            const btn = document.querySelector('.ext-menu-btn')
            if (btn && window.api.updatePopup) window.api.updatePopup(KEY, { type: 'menu', items })
          })
        }
      }),
      window.api.onPopupClosed((key) => {
        if (key === KEY) {
          if (!selfClosedRef.current) {
            suppressRef.current = true
            clearTimeout(suppressTimerRef.current)
            suppressTimerRef.current = setTimeout(() => { suppressRef.current = false }, 400)
          }
          selfClosedRef.current = false
          if (openPopupRef.current === key) openPopupRef.current = null
        }
      }),
    ]
    return () => { offs.forEach((o) => o && o()) }
  }, [onOpenPage])

  const enabledCount = exts.filter((e) => e.enabled).length

  return (
    <button
      className={'tool-btn ext-menu-btn'}
      title={'Extensiones (activas: ' + enabledCount + ')'}
      onClick={(e) => openMenu(e.currentTarget)}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19.4 13a5 5 0 0 0-2.9-9.1 5 5 0 0 0-8.4 3.5 5 5 0 0 0-1.6 9.5A5 5 0 1 0 15.5 20a5 5 0 0 0 3.9-7z" />
        <path d="M12 9v5M10 11.5h4" />
      </svg>
      {enabledCount > 0 && <span className="badge">{enabledCount}</span>}
    </button>
  )
}
