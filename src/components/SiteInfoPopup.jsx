import { useEffect, useState } from 'react'

const PERM_LABELS = {
  media: 'Cámara y micrófono', camera: 'Cámara', microphone: 'Micrófono',
  geolocation: 'Ubicación', notifications: 'Notificaciones',
  'clipboard-read': 'Leer portapapeles', 'clipboard-sanitized-write': 'Escribir portapapeles',
  'display-capture': 'Captura de pantalla', keyboardLock: 'Bloqueo de teclado',
  'window-management': 'Ventanas', fileSystem: 'Archivos', fullscreen: 'Pantalla completa',
  pointerLock: 'Bloqueo del puntero', openExternal: 'Abrir enlaces externos',
  midi: 'MIDI', midiSysex: 'MIDI (sistema)', serial: 'Puertos serie', hid: 'Dispositivos HID',
  usb: 'Dispositivos USB', 'storage-access': 'Almacenamiento', 'local-fonts': 'Fuentes locales',
  unknown: 'Permiso',
}

export default function SiteInfoPopup({ url, anchor, onClose }) {
  const [cookies, setCookies] = useState(null)
  const [perms, setPerms] = useState([])
  const secure = url && url.startsWith('https://')
  const origin = url ? safeOrigin(url) : ''

  useEffect(() => {
    if (!origin) return
    window.api.siteCookies(origin).then(setCookies)
    window.api.permissionsList().then((list) => {
      const site = (list || []).find((s) => s.origin === origin)
      setPerms((site && site.perms) || [])
    })
  }, [origin])

  async function clearSite() {
    if (!origin) return
    await window.api.siteClear(origin)
    setCookies(0)
  }

  async function setPerm(permission, state) {
    await window.api.permissionsSet(origin, permission, state)
    const list = await window.api.permissionsList()
    const site = (list || []).find((s) => s.origin === origin)
    setPerms((site && site.perms) || [])
  }

  async function clearSitePerms() {
    await window.api.permissionsClear(origin)
    setPerms([])
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
        <button className="btn" onClick={() => window.api.openPage('permissions')}>Gestionar</button>
        <button className="btn" onClick={clearSitePerms}>Restablecer</button>
      </div>
      {perms.slice(0, 4).map((p) => (
        <div key={p.permission} className="perm-inline">
          <span className="perm-inline-name">{PERM_LABELS[p.permission] || p.permission}</span>
          <div className="seg">
            {[['allow', 'Permitir'], ['deny', 'Bloquear'], ['ask', 'Preguntar']].map(([st, label]) => (
              <button key={st} className={p.state === st ? 'on-' + st : ''} onClick={() => setPerm(p.permission, st)}>{label}</button>
            ))}
          </div>
          <button className="btn" title="Permitir una vez (solo mientras la pestaña siga abierta)" onClick={() => setPerm(p.permission, 'once')}>Una vez</button>
        </div>
      ))}
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
  if (top + 420 > vh) top = Math.max(pad, anchor.top - 6 - 360)
  return { top, left, transform: 'none' }
}
