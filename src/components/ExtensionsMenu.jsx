import { useEffect, useRef, useState } from 'react'

export default function ExtensionsMenu({ onOpenPage }) {
  const [open, setOpen] = useState(false)
  const [exts, setExts] = useState([])
  const ref = useRef(null)

  useEffect(() => {
    function close(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [])

  function refresh() {
    window.api.extensionsList().then(setExts)
  }

  useEffect(() => {
    if (open) refresh()
  }, [open])

  const enabledCount = exts.filter((e) => e.enabled).length

  return (
    <div className="ext-menu-wrap" ref={ref}>
      <button
        className={'tool-btn ext-menu-btn' + (open ? ' active' : '')}
        title={'Extensiones (activas: ' + enabledCount + ')'}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19.4 13a5 5 0 0 0-2.9-9.1 5 5 0 0 0-8.4 3.5 5 5 0 0 0-1.6 9.5A5 5 0 1 0 15.5 20a5 5 0 0 0 3.9-7z" />
          <path d="M12 9v5M10 11.5h4" />
        </svg>
        {enabledCount > 0 && <span className="badge">{enabledCount}</span>}
      </button>
      {open && (
        <div className="ext-menu">
          <div className="ext-menu-head">
            <span>Extensiones ({exts.length})</span>
            <button className="ext-menu-manage" onClick={() => { setOpen(false); onOpenPage('extensions') }}>Gestionar</button>
          </div>
          {exts.length === 0 && <div className="ext-menu-empty">Ninguna instalada. Pulsa "Gestionar" para añadir desde Chrome Web Store.</div>}
          {exts.map((e) => (
            <div key={e.id} className="ext-menu-item">
              {e.icon ? <img className="ext-menu-icon" src={e.icon} alt="" /> : <span className="ext-menu-icon placeholder">{e.name.slice(0, 1).toUpperCase()}</span>}
              <div className="ext-menu-info">
                <b>{e.name}</b>
                <span>v{e.version}</span>
              </div>
              <button
                className={'switch' + (e.enabled ? ' on' : '')}
                title={e.enabled ? 'Desactivar' : 'Activar'}
                onClick={async () => { await window.api.extensionsSetEnabled(e.id, !e.enabled); refresh() }}
              >
                <span className="knob" />
              </button>
              <button
                className="ext-menu-del"
                title="Quitar extensión"
                onClick={async () => { await window.api.extensionsRemove(e.id); refresh() }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          <div className="ext-menu-foot">
            <button className="btn" onClick={() => { setOpen(false); onOpenPage('extensions') }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Añadir o gestionar extensiones…
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
