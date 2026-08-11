import { useEffect, useRef, useState } from 'react'
import { useGamepad, rumble } from '../components/useGamepad.js'
import GamepadHud from '../components/GamepadHud.jsx'
import OnScreenKeyboard from '../components/OnScreenKeyboard.jsx'
import { typeIntoChrome, typeIntoWebview } from '../components/tvTyping.js'

const HINT_COLLECT = `(() => {
  const els = Array.from(document.querySelectorAll('a[href], button, input, textarea, [role="button"]'))
  const vw = window.innerWidth, vh = window.innerHeight
  const out = []
  for (const el of els) {
    const r = el.getBoundingClientRect()
    if (r.width < 4 || r.height < 4) continue
    if (r.top > vh || r.bottom < 0 || r.left > vw || r.right < 0) continue
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue
    out.push({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
  }
  return out
})()`

const MEDIA_KEYS = { mediaPlayPause: ' ', mediaSeekBack: 'j', mediaSeekFwd: 'l', mediaVolUp: 'ArrowUp', mediaVolDown: 'ArrowDown' }

export default function OverlayApp() {
  const [url, setUrl] = useState('')
  const [nav, setNav] = useState({ canGoBack: false, canGoForward: false, isLoading: false })
  const [viewInfo, setViewInfo] = useState(null)
  const [tabs, setTabs] = useState(() => [{ id: 't0', title: 'Nueva pestaña', url: '', src: 'https://www.google.com' }])
  const [activeId, setActiveId] = useState('t0')
  const elsRef = useRef(new Map())
  const tabSeq = useRef(0)
  const cursorRef = useRef({ x: 0, y: 0, visible: false })
  const dragRef = useRef(false)
  const kbRef = useRef(null)
  const [gpConnected, setGpConnected] = useState(false)
  const [gpName, setGpName] = useState('')
  const [hudOpen, setHudOpen] = useState(false)
  const [hintMode, setHintMode] = useState(false)
  const [hints, setHints] = useState([])
  const [hintSel, setHintSel] = useState(0)
  const [kbOpen, setKbOpen] = useState(false)
  const [tvIdle, setTvIdle] = useState(false)
  const idleTimerRef = useRef(null)

  useEffect(() => {
    window.api.viewInfo().then(setViewInfo)
  }, [])

  useEffect(() => {
    return window.api.onOskStatus((open) => {
      setKbOpen(!!open)
    })
  }, [])

  const activeTab = tabs.find((t) => t.id === activeId) || null

  function el() {
    return activeId ? elsRef.current.get(activeId) || null : null
  }

  function updateTab(id, patch) {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  function newTab(target) {
    const id = 't' + (++tabSeq.current)
    const t = { id, title: 'Nueva pestaña', url: target || '', src: target || 'https://www.google.com' }
    setTabs((prev) => [...prev, t])
    setActiveId(id)
    setUrl(t.url)
  }

  function switchTab(id) {
    const t = tabs.find((x) => x.id === id)
    setActiveId(id)
    setUrl(t ? t.url : '')
  }

  function closeTab(id) {
    const i = tabs.findIndex((t) => t.id === id)
    const next = tabs.filter((t) => t.id !== id)
    if (!next.length) { window.api.close(); return }
    if (activeId === id) {
      const n = next[Math.min(i, next.length - 1)]
      setActiveId(n.id)
      setUrl(n.url)
    }
    setTabs(next)
  }

  function cycleTab(delta) {
    if (tabs.length < 2) return
    const i = tabs.findIndex((t) => t.id === activeId)
    if (i < 0) return
    const n = tabs[(i + delta + tabs.length) % tabs.length]
    setActiveId(n.id)
    setUrl(n.url)
  }

  function pokeActivity() {
    setTvIdle(false)
    clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => setTvIdle(true), 4000)
  }

  function pointerTarget(x, y) {
    const wv = el()
    if (wv) {
      try {
        const r = wv.getBoundingClientRect()
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
          return { target: 'webview', el: wv, x: x - r.left, y: y - r.top }
        }
      } catch {}
    }
    return { target: 'chrome' }
  }

  function sendWebMouse(wv, x, y, action, opts) {
    opts = opts || {}
    const pt = { x: Math.round(x), y: Math.round(y) }
    try {
      if (action === 'move') wv.sendInputEvent({ type: 'mouseMove', ...pt, movementX: 0, movementY: 0, button: opts.button || 'left', buttons: opts.buttons || 0 })
      else if (action === 'down') wv.sendInputEvent({ type: 'mouseDown', ...pt, button: opts.button || 'left', clickCount: opts.count || 1 })
      else if (action === 'up') wv.sendInputEvent({ type: 'mouseUp', ...pt, button: opts.button || 'left', clickCount: opts.count || 1 })
    } catch {}
  }

  function sendChromeMouse(type, x, y, opts) {
    opts = opts || {}
    try {
      window.api.uiPointer({
        type,
        x: Math.round(x),
        y: Math.round(y),
        button: opts.button === 'right' ? 'right' : 'left',
        count: opts.count || 1,
        buttons: opts.buttons || 0,
        deltaX: opts.deltaX || 0,
        deltaY: opts.deltaY || 0,
      })
    } catch {}
  }

  function doPointerClick(x, y, button, count) {
    const t = pointerTarget(x, y)
    if (t.target === 'webview') {
      sendWebMouse(t.el, t.x, t.y, 'down', { button, count })
      sendWebMouse(t.el, t.x, t.y, 'up', { button, count })
    } else {
      if (count > 1) {
        sendChromeMouse('down', x, y, { button })
        sendChromeMouse('up', x, y, { button })
      }
      sendChromeMouse('down', x, y, { button, count })
      sendChromeMouse('up', x, y, { button, count })
    }
  }

  function doScroll(dx, dy) {
    const c = cursorRef.current
    const t = pointerTarget(c.x, c.y)
    if (t.target === 'webview') {
      try {
        t.el.sendInputEvent({ type: 'mouseWheel', x: Math.round(t.x), y: Math.round(t.y), deltaX: Math.round(dx), deltaY: Math.round(dy) })
      } catch {}
    } else {
      sendChromeMouse('wheel', c.x, c.y, { deltaX: dx, deltaY: dy })
    }
  }

  function dragMove(x, y, down) {
    const t = pointerTarget(x, y)
    if (t.target === 'webview') {
      if (down) sendWebMouse(t.el, t.x, t.y, 'down', { button: 'left', count: 1 })
      else sendWebMouse(t.el, t.x, t.y, 'up', { button: 'left', count: 1 })
    } else {
      if (down) sendChromeMouse('down', x, y, { button: 'left' })
      else sendChromeMouse('up', x, y, { button: 'left' })
    }
  }

  function sendKey(code) {
    const wv = el()
    if (!wv) return
    try {
      const kc = code.length === 1 && /[a-z]/.test(code) ? code.toUpperCase() : code
      wv.sendInputEvent({ type: 'keyDown', keyCode: kc })
      wv.sendInputEvent({ type: 'keyUp', keyCode: kc })
    } catch {}
  }

  function zoomStep(dir) {
    const wv = el()
    if (!wv) return
    try {
      const z = wv.getZoomFactor ? wv.getZoomFactor() : 1
      wv.setZoomFactor(Math.min(3, Math.max(0.25, (z || 1) + dir * 0.1)))
    } catch {}
  }

  function navAction(action) {
    const wv = el()
    if (!wv) return
    try {
      if (action === 'goBack') { if (wv.canGoBack()) wv.goBack() }
      else if (action === 'goForward') { if (wv.canGoForward()) wv.goForward() }
      else if (action === 'reload') wv.reload()
      else if (action === 'stop') wv.stop()
    } catch {}
  }

  function hintLabels(n) {
    const letters = 'abcdefghijklmnopqrstuvwxyz'
    const labels = []
    for (let i = 0; i < n; i++) {
      let s = ''
      let v = i
      do { s = letters[v % 26] + s; v = Math.floor(v / 26) - 1 } while (v >= 0)
      labels.push(s)
    }
    return labels
  }

  function enterHints() {
    const wv = el()
    if (!wv) return
    wv.executeJavaScript(HINT_COLLECT)
      .then((points) => {
        if (!Array.isArray(points) || !points.length) return
        const r = wv.getBoundingClientRect()
        const labels = hintLabels(points.length)
        setHints(points.map((p, i) => ({ label: labels[i], x: r.left + p.x, y: r.top + p.y, xv: p.x, yv: p.y })))
        setHintSel(0)
        setHintMode(true)
        rumble(40, 0.3, 0.3)
      })
      .catch(() => {})
  }

  function exitHints() {
    setHintMode(false)
    setHints([])
  }

  function activateHint() {
    const wv = el()
    const h = hints[hintSel]
    if (!wv || !h) { exitHints(); return }
    sendWebMouse(wv, h.xv, h.yv, 'down', { button: 'left', count: 1 })
    sendWebMouse(wv, h.xv, h.yv, 'up', { button: 'left', count: 1 })
    rumble(30, 0.3, 0.3)
    exitHints()
  }

  function typeKey(key) {
    const ae = document.activeElement
    const isChromeField = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)
    if (isChromeField) typeIntoChrome(ae, key)
    else typeIntoWebview(el(), key)
    rumble(20, 0.2, 0.2)
  }

  function handleEvent(ev) {
    const c = cursorRef.current
    if (!c) return
    switch (ev.type) {
      case 'pointer': {
        if (dragRef.current) {
          const t = pointerTarget(ev.x, ev.y)
          if (t.target === 'webview') sendWebMouse(t.el, t.x, t.y, 'move', { buttons: 1 })
          else sendChromeMouse('move', ev.x, ev.y, { buttons: 1 })
        } else {
          const t = pointerTarget(ev.x, ev.y)
          if (t.target === 'webview') sendWebMouse(t.el, t.x, t.y, 'move', { buttons: 0 })
          else sendChromeMouse('move', ev.x, ev.y, { buttons: 0 })
        }
        pokeActivity()
        break
      }
      case 'scroll':
        doScroll(ev.dx, ev.dy)
        pokeActivity()
        break
      case 'drag':
        dragRef.current = ev.down
        dragMove(ev.x, ev.y, ev.down)
        break
      case 'action':
        runAction(ev.name)
        pokeActivity()
        break
    }
  }

  function runAction(name) {
    const c = cursorRef.current
    switch (name) {
      case 'confirm': {
        if (kbOpen) { if (kbRef.current) kbRef.current.press(); return }
        if (hintMode) { activateHint(); return }
        doPointerClick(c.x, c.y, 'left', 1)
        rumble(25, 0.3, 0.3)
        return
      }
      case 'cancel': {
        if (kbOpen) { window.api.oskClose(); return }
        if (hintMode) { exitHints(); return }
        doPointerClick(c.x, c.y, 'right', 1)
        return
      }
      case 'double': {
        if (hintMode) return
        doPointerClick(c.x, c.y, 'left', 2)
        rumble(25, 0.3, 0.3)
        return
      }
      case 'tabNext': cycleTab(1); return
      case 'tabPrev': cycleTab(-1); return
      case 'tabNew': newTab(); rumble(30, 0.3, 0.3); return
      case 'tabClose': if (activeTab) closeTab(activeTab.id); rumble(30, 0.3, 0.3); return
      case 'navBack': navAction('goBack'); return
      case 'navForward': navAction('goForward'); return
      case 'up':
      case 'down': {
        if (kbOpen) { if (kbRef.current) kbRef.current.nav(name === 'down' ? 'down' : 'up'); return }
        if (hintMode) { setHintSel((s) => (s + (name === 'down' ? 1 : -1) + hints.length) % hints.length); return }
        doScroll(0, name === 'down' ? 120 : -120)
        return
      }
      case 'left':
      case 'right': {
        if (kbOpen) { if (kbRef.current) kbRef.current.nav(name === 'left' ? 'left' : 'right'); return }
        if (hintMode) return
        navAction(name === 'left' ? 'goBack' : 'goForward')
        return
      }
      case 'palette': toggleKb(); return
      case 'hints': if (hintMode) exitHints(); else enterHints(); return
      case 'hud': setHudOpen((o) => !o); return
      case 'zoomIn': zoomStep(1); return
      case 'zoomOut': zoomStep(-1); return
      default: {
        const key = MEDIA_KEYS[name]
        if (key) sendKey(key)
      }
    }
  }

  function toggleKb() {
    if (kbOpen) window.api.oskClose()
    else window.api.oskOpen()
  }

  function onFocusIn(e) {
    const t = e.target
    if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA' && !t.isContentEditable)) return
    window.api.tvInputFocus()
  }

  function onFocusOut(e) {
    const t = e.target
    if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA' && !t.isContentEditable)) return
    window.api.tvInputBlur()
  }

  useEffect(() => {
    document.addEventListener('focusin', onFocusIn, true)
    document.addEventListener('focusout', onFocusOut, true)
    return () => {
      document.removeEventListener('focusin', onFocusIn, true)
      document.removeEventListener('focusout', onFocusOut, true)
      clearTimeout(idleTimerRef.current)
    }
  }, [])

  useGamepad({
    enabled: true,
    onEvent: handleEvent,
    onConnect: (gp) => { setGpConnected(true); setGpName(gp && gp.id ? gp.id : 'Mando') },
    onDisconnect: () => { setGpConnected(false); exitHints() },
    onActivity: pokeActivity,
    cursorRef,
  })

  function go(raw) {
    const q = (raw || '').trim()
    if (!q) return
    const wv = el()
    if (!wv) return
    let target = q
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(q)) target = q
    else if (/^[\w-]+(\.[\w-]+)+([/:?#].*)?$/.test(q)) target = 'https://' + q
    else target = 'https://www.google.com/search?q=' + encodeURIComponent(q)
    wv.loadURL(target)
    if (activeId) updateTab(activeId, { url: target })
    setUrl(target)
    if (wv.blur) wv.blur()
  }

  return (
    <div className="overlay-app">
      <div className="overlay-tabs">
        {tabs.map((t) => (
          <div key={t.id} className={'ov-tab' + (t.id === activeId ? ' active' : '')} onClick={() => switchTab(t.id)}>
            <span className="ov-tab-title">{t.title || 'Nueva pestaña'}</span>
            <button className="ov-tab-close" title="Cerrar pestaña" onClick={(e) => { e.stopPropagation(); closeTab(t.id) }}>×</button>
          </div>
        ))}
        <button className="ov-tab-new" title="Nueva pestaña" onClick={() => newTab()}>+</button>
      </div>
      <div className="overlay-header">
        <button className="ov-btn" title="Atrás" onClick={() => navAction('goBack')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <button className="ov-btn" title="Adelante" onClick={() => navAction('goForward')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
        </button>
        <button className="ov-btn" title="Recargar" onClick={() => navAction('reload')}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
        </button>
        <form className="ov-address" onSubmit={(e) => { e.preventDefault(); go(url) }}>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Buscar o escribir una dirección…" spellCheck={false} />
        </form>
        <button className="ov-btn" title="Cerrar (o el atajo)" onClick={() => window.api.close()}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="overlay-body">
        {viewInfo && tabs.map((t) => (
          <webview
            key={t.id}
            ref={(elw) => { if (elw) elsRef.current.set(t.id, elw); else elsRef.current.delete(t.id) }}
            className={'overlay-webview' + (t.id === activeId ? ' active' : '')}
            preload={viewInfo.preload || undefined}
            src={t.src}
            onDidNavigate={(e) => { updateTab(t.id, { url: e.url }); if (t.id === activeId) setUrl(e.url) }}
            onDidNavigateInPage={(e) => { updateTab(t.id, { url: e.url }); if (t.id === activeId) setUrl(e.url) }}
            onPageTitleUpdated={(e) => updateTab(t.id, { title: e.title })}
            onDidStartLoading={() => setNav((n) => ({ ...n, isLoading: true }))}
            onDidStopLoading={() => setNav((n) => ({ ...n, isLoading: false }))}
          />
        ))}
      </div>
      <GamepadHud
        connected={gpConnected}
        gpName={gpName}
        cursorRef={cursorRef}
        hints={hints}
        hintSel={hintSel}
        hintActive={hintMode}
        hudOpen={hudOpen}
        idle={tvIdle}
      />
      {kbOpen && <OnScreenKeyboard ref={kbRef} onKey={typeKey} />}
    </div>
  )
}
