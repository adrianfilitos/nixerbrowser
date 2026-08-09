import { useEffect, useState } from 'react'

export default function ShieldsPopup({ origin, anchor, onClose }) {
  const [s, setS] = useState(null)
  const [recent, setRecent] = useState([])

  useEffect(() => {
    window.api.shieldsGet(origin).then(setS)
    window.api.adblockRecent().then((list) => {
      setRecent((list || []).filter((r) => r.url.indexOf(origin) === 0).slice(0, 8))
    })
  }, [origin])

  if (!s) return null

  function toggle(key, value) {
    setS((prev) => ({ ...prev, [key]: value }))
    window.api.shieldsSet(origin, { [key]: value })
  }

  return (
    <div className="popup-card" style={anchorStyle(anchor)}>
      <div className="popup-head">
        <span className="shield-ico">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5l8-3z" />
          </svg>
        </span>
        <div className="popup-title-wrap">
          <b>Protecciones</b>
          <div className="popup-sub">{s.origin.replace(/^https?:\/\//, '')}</div>
        </div>
        <button className="bar-btn" onClick={onClose} title="Cerrar">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="shields-row">
        <div><b>Anuncios</b><div className="popup-sub">Bloqueados: {s.ads}</div></div>
        <Switch on={s.blockAds} onChange={(v) => toggle('blockAds', v)} />
      </div>
      <div className="shields-row">
        <div><b>Scripts</b><div className="popup-sub">Bloqueados: {s.scripts}</div></div>
        <Switch on={s.blockScripts} onChange={(v) => toggle('blockScripts', v)} />
      </div>
      <div className="shields-row">
        <div><b>Cookies de terceros</b><div className="popup-sub">Se aplica en todo el navegador</div></div>
        <Switch on={s.blockCookies} onChange={(v) => toggle('blockCookies', v)} />
      </div>
      {recent.length > 0 && (
        <div className="shields-log">
          <div className="popup-sub" style={{ padding: '6px 12px 2px' }}><b>Bloqueados ahora mismo</b></div>
          {recent.map((r, i) => (
            <div key={i} className="shield-log-item" title={r.url}>
              <span className={'log-type ' + r.type}>{r.type === 'anuncio' ? 'AD' : 'JS'}</span>
              <span className="log-url">{r.url.length > 60 ? r.url.slice(0, 60) + '…' : r.url}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Switch({ on, onChange }) {
  return (
    <button className={'switch' + (on ? ' on' : '')} onClick={() => onChange(!on)}>
      <span className="knob" />
    </button>
  )
}

function anchorStyle(anchor) {
  if (!anchor) return null
  const W = 380
  const vw = window.innerWidth
  const vh = window.innerHeight
  const pad = 8
  let left = anchor.left
  if (left + W > vw - pad) left = Math.max(pad, vw - W - pad)
  let top = anchor.bottom + 6
  if (top + 420 > vh) top = Math.max(pad, anchor.top - 6 - 320)
  return { top, left, transform: 'none' }
}
