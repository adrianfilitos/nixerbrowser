import { useEffect, useState } from 'react'

export default function SiteInfoPopup({ url, anchor, onClose }) {
  const [cookies, setCookies] = useState(null)
  const secure = url && url.startsWith('https://')
  const origin = url ? safeOrigin(url) : ''

  useEffect(() => {
    if (!origin) return
    window.api.siteCookies(origin).then(setCookies)
  }, [origin])

  async function clearSite() {
    if (!origin) return
    await window.api.siteClear(origin)
    setCookies(0)
  }

  return (
    <div className="popup-card" style={anchorStyle(anchor)}>
      <div className="popup-head">
        <span className={'sec-dot ' + (secure ? 'secure' : 'insecure')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {secure ? (
              <>
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </>
            ) : (
              <>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </>
            )}
          </svg>
        </span>
        <div className="popup-title-wrap">
          <b>{secure ? 'Conexión segura' : 'Conexión no segura'}</b>
          <div className="popup-sub">{origin.replace(/^https?:\/\//, '')}</div>
        </div>
        <button className="bar-btn" onClick={onClose} title="Cerrar">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="shields-row">
        <div><b>Cookies y datos</b><div className="popup-sub">{cookies === null ? '…' : cookies + ' cookies de este sitio'}</div></div>
        <button className="btn" onClick={clearSite}>Borrar</button>
      </div>
      <div className="shields-row">
        <div><b>Permisos</b><div className="popup-sub">Cámara, ubicación, notificaciones…</div></div>
        <button className="btn" onClick={() => window.api.openPage('settings')}>Gestionar</button>
      </div>
    </div>
  )
}

function safeOrigin(url) {
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
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
  if (top + 320 > vh) top = Math.max(pad, anchor.top - 6 - 260)
  return { top, left, transform: 'none' }
}
