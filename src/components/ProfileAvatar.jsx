import { useEffect, useRef, useState } from 'react'

// Avatar del perfil activo: por defecto usa el del PROVEEDOR (Google/Microsoft)
// cuando existe; con toggle a avatar local (inicial). Al pulsarlo abre la tarjeta
// de perfil (info minimal + perfiles + acciones + estado de sync).
export default function ProfileAvatar() {
  const [st, setSt] = useState(null)
  const openPopupRef = useRef(null)
  const suppressRef = useRef(false)
  const suppressTimerRef = useRef(null)

  async function refresh() {
    try {
      const s = await window.api.profilesStatus()
      setSt(s)
      return s
    } catch { return st }
  }
  useEffect(() => { refresh() }, [])
  useEffect(() => {
    const off = window.api.onUi && window.api.onUi((action) => { if (action === 'profiles-changed') refresh() })
    return off
  }, [])

  function buildPayload(s) {
    const cur = s || st || {}
    return {
      type: 'profile',
      activeId: cur.activeId || null,
      name: cur.activeName || '',
      color: cur.activeColor || '',
      email: cur.activeEmail || '',
      cloud: !!(cur.cloud),
      cloudConfigured: !!(cur.cloudConfigured),
      lastSync: cur.lastSync || null,
      avatar: cur.avatar || '',
      avatarSource: cur.avatarSource || 'local',
      profiles: (cur.profiles) || [],
    }
  }

  useEffect(() => {
    const off = window.api.onPopupAction(({ key, data }) => {
      if (key !== 'profile-popup') return
      if (openPopupRef.current === key) openPopupRef.current = null
      if (data === 'manage' || data === 'new-local') { if (window.api.openPage) window.api.openPage('settings') }
      else if (data === 'menu') {
        window.api.hidePopup('profile-popup')
        openPopupRef.current = null
        // Retardo: deja que el padre recupere el foco tras cerrar la tarjeta,
        // para que el menú (closeOnBlur) no se cierre por esa race.
        setTimeout(() => window.dispatchEvent(new CustomEvent('nixer-open-menu')), 400)
      }
      else if (data === 'signout') {
        window.api.profileSignout().then(async () => { if (window.api.updatePopup) window.api.updatePopup('profile-popup', buildPayload(await refresh())) })
      }
      else if (data === 'signin-google') {
        window.api.profileSigninProvider('google', true).then(async () => { if (window.api.updatePopup) window.api.updatePopup('profile-popup', buildPayload(await refresh())) })
      }
      else if (data === 'sync') {
        window.api.profileSyncNow().then(async () => { if (window.api.updatePopup) window.api.updatePopup('profile-popup', buildPayload(await refresh())) })
      }
      else if (data && data.startsWith('switch:')) window.api.profileSwitch(data.slice(7))
    })
    return off
  })

  const providerAvatar = st && st.activeType === 'cloud' && st.avatarSource === 'provider' && st.avatar ? st.avatar : null
  const initial = (st && st.activeName ? st.activeName.slice(0, 1) : 'N').toUpperCase()

  async function toggleMenu(btn) {
    if (suppressRef.current) { suppressRef.current = false; clearTimeout(suppressTimerRef.current); return }
    // Siempre refrescar: la tarjeta muestra el estado actual aunque se haya
    // creado/cambiado un perfil fuera del broadcast (p.ej. desde Ajustes).
    const s = await refresh()
    if (openPopupRef.current === 'profile-popup') {
      window.api.hidePopup('profile-popup')
      openPopupRef.current = null
      return
    }
    const r = btn.getBoundingClientRect()
    const listH = Math.min(220, ((s && s.profiles) || []).length * 46 + 6)
    const actsH = (((s && s.cloud) ? 1 : 0) + (((s && !s.cloud && s.cloudConfigured) ? 1 : 0)) + 3) * 38 + 12
    const h = Math.min(window.innerHeight - r.bottom - 8, 150 + ((s && s.cloud) ? 44 : 0) + listH + actsH + 6)
    window.api.showPopup({
      key: 'profile-popup',
      x: Math.round(r.right - 300),
      y: Math.round(r.bottom + 6),
      width: 300,
      height: Math.max(260, h),
      payload: buildPayload(s),
    })
    openPopupRef.current = 'profile-popup'
  }

  return (
    <button
      className="profile-avatar"
      title={(st ? st.activeName : '') + (st && st.activeType === 'cloud' ? ' · ' + (st.activeEmail || '') : '')}
      onClick={(e) => toggleMenu(e.currentTarget)}
    >
      {providerAvatar ? (
        <img className="profile-avatar-img" src={providerAvatar} alt="" />
      ) : (
        <span className="profile-avatar-initial" style={{ background: (st && st.activeColor) || 'var(--accent)' }}>{initial}</span>
      )}
    </button>
  )
}
