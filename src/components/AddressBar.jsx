import { useEffect, useRef, useState } from 'react'

const INTERNAL_LABELS = {
  newtab: 'Nueva pestaña',
  history: 'Historial',
  bookmarks: 'Marcadores',
  downloads: 'Descargas',
  settings: 'Ajustes',
  ai: 'Asistente IA',
  reader: 'Modo lectura',
  welcome: 'Bienvenida',
  incognito: 'Incógnito',
}

export default function AddressBar({ url, internalKey, focusSignal, navState, onNavigate, onNavAction, onOverlayChange = () => {}, onShields, onSiteInfo }) {
  const [value, setValue] = useState(url)
  const [suggestions, setSuggestions] = useState([])
  const [selected, setSelected] = useState(-1)
  const [open, setOpen] = useState(false)
  const [aiMode, setAiMode] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [thread, setThread] = useState([])
  const [engines, setEngines] = useState([])
  const [defaultEngine, setDefaultEngine] = useState(null)
  const [engOpen, setEngOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef(null)
  const aiInputRef = useRef(null)
  const timerRef = useRef(null)
  const threadRef = useRef([])
  const aiBusyRef = useRef(false)

  const security = securityFor(url)

  useEffect(() => {
    window.api.searchEngines().then((info) => {
      setEngines(info.engines || [])
      setDefaultEngine(info.engines.find((e) => e.id === info.defaultId) || (info.engines && info.engines[0]) || null)
    })
  }, [])

  useEffect(() => {
    onOverlayChange(aiMode || engOpen || (open && suggestions.length > 0))
  }, [aiMode, engOpen, open, suggestions, onOverlayChange])

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setValue(url)
    setOpen(false)
    setSuggestions([])
    setSelected(-1)
  }, [url])

  useEffect(() => {
    if (focusSignal > 0) {
      const el = inputRef.current
      if (el) {
        el.focus()
        el.select()
      }
    }
  }, [focusSignal])

  useEffect(() => {
    function close(e) {
      if (engOpen && !e.target.closest('.engine-chip, .engine-menu')) setEngOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [engOpen])

  const isInternal = !!internalKey
  const internalUrl = isInternal ? 'nixer://' + internalKey : ''
  const internalLabel = (isInternal && (INTERNAL_LABELS[internalKey] || internalKey)) || ''

  useEffect(() => {
    clearTimeout(timerRef.current)
    const q = value.trim()
    if (aiMode || q.startsWith('/') || !focused) {
      setSuggestions([])
      setOpen(false)
      return
    }
    if (!q) {
      setSuggestions([])
      setOpen(false)
      return
    }
    timerRef.current = setTimeout(async () => {
      const q2 = value.trim()
      if (!q2) {
        setSuggestions([])
        setOpen(false)
        return
      }
      const [res, sugs] = await Promise.all([
        window.api.autocomplete(q2),
        window.api.searchSuggest(q2).catch(() => []),
      ])
      let items = res || []
      const list = sugs || []
      if (list.length) {
        const urls = await Promise.all(list.map((s) => window.api.searchUrl(s).catch(() => null)))
        const searchItems = list
          .map((s, i) => ({ type: 'search', title: s, url: urls[i] }))
          .filter((x) => x.url)
        items = searchItems.concat(items)
      }
      const seen = new Set()
      const unique = items.filter((it) => {
        const k = it && it.url
        if (!k || seen.has(k)) return false
        seen.add(k)
        return true
      })
      const extra = []
      const cs = calcSuggestion(q2)
      if (cs) extra.push(cs)
      const cv = convSuggestion(q2)
      if (cv && (!cs || cv.url !== cs.url)) extra.push(cv)
      setSuggestions(extra.concat(unique))
      setSelected(-1)
      setOpen(extra.length + unique.length > 0)
    }, 120)
    return () => clearTimeout(timerRef.current)
  }, [value, internalKey, aiMode, focused])

  function toggleAi() {
    setAiMode((m) => {
      const next = !m
      if (next) setOpen(true)
      else setOpen(false)
      return next
    })
    setTimeout(() => {
      if (aiInputRef.current) aiInputRef.current.focus()
      else if (inputRef.current) inputRef.current.focus()
    }, 0)
  }

  function resolveTarget(raw) {
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return raw
    if (/^localhost(:\d+)?(\/.*)?$/.test(raw)) return 'http://' + raw
    if (/^[\w-]+(\.[\w-]+)+([/:?#].*)?$/.test(raw)) return 'https://' + raw
    return null
  }

  function calcSuggestion(q) {
    const t = q.trim()
    if (!/^[\d\s+\-*/().%^,]+$/.test(t) || !/[+\-*/^]/.test(t)) return null
    try {
      const expr = t.replace(/\^/g, '**').replace(/,/g, '.')
      const val = Function('"use strict";return (' + expr + ')')()
      if (typeof val === 'number' && isFinite(val)) {
        const rounded = Math.round(val * 1e6) / 1e6
        return { type: 'calc', title: t + ' = ' + rounded, url: 'https://www.google.com/search?q=' + encodeURIComponent(t) }
      }
    } catch {}
    return null
  }

  const UNITS = {
    currency: { usd: 1, eur: 0.92, gbp: 0.79, jpy: 157, mxn: 18.5 },
    length: { km: 1, mi: 0.621371, m: 1000, cm: 100000, ft: 3280.84, in: 39370.1 },
    weight: { kg: 1, lb: 2.20462, oz: 35.274 },
    volume: { l: 1, gal: 0.264172, ml: 1000 },
  }

  function convSuggestion(q) {
    const m = /^(\d+(?:[.,]\d+)?)\s*(usd|eur|gbp|jpy|mxn|km|mi|m|cm|ft|in|kg|lb|oz|l|gal|ml|c|f)\s*(?:a|to|en|->)\s*(usd|eur|gbp|jpy|mxn|km|mi|m|cm|ft|in|kg|lb|oz|l|gal|ml|c|f)$/i.exec(q.trim())
    if (!m) return null
    const val = parseFloat(m[1].replace(',', '.'))
    const from = m[2].toLowerCase()
    const to = m[3].toLowerCase()
    let result = null
    if ((from === 'c' || from === 'f') && (to === 'c' || to === 'f')) {
      const c = from === 'c' ? val : (val - 32) * 5 / 9
      result = to === 'c' ? c : c * 9 / 5 + 32
    } else {
      for (const [, map] of Object.entries(UNITS)) {
        if (from in map && to in map) { result = val / map[from] * map[to]; break }
      }
    }
    if (result === null || !isFinite(result)) return null
    return { type: 'calc', title: val + ' ' + from + ' = ' + (Math.round(result * 1000) / 1000) + ' ' + to, url: 'https://www.google.com/search?q=' + encodeURIComponent(q.trim()) }
  }

  async function submit(e) {
    e.preventDefault()
    const raw = value.trim()
    if (!raw) return
    if (aiMode || raw.startsWith('/')) {
      const promptRaw = raw.startsWith('/') ? raw.slice(1).trim() : raw
      if (!promptRaw) return
      let prompt = promptRaw
      const cm = /^(resumir|resume|traducir|translate|corregir|corrige)\s+(.+)$/i.exec(promptRaw)
      if (cm) {
        const cmd = cm[1].toLowerCase()
        const rest = cm[2]
        if (cmd === 'resumir' || cmd === 'resume') prompt = 'Resume lo siguiente:\n\n' + rest
        else if (cmd === 'traducir' || cmd === 'translate') prompt = 'Traduce al español:\n\n' + rest
        else if (cmd === 'corregir' || cmd === 'corrige') prompt = 'Corrige la gramática y ortografía:\n\n' + rest
      }
      const userMsg = { role: 'user', content: prompt }
      threadRef.current = [...threadRef.current, userMsg]
      setThread(threadRef.current)
      setValue('')
      setAiBusy(true)
      aiBusyRef.current = true
      setOpen(true)
      const res = await window.api.aiChat(threadRef.current)
      aiBusyRef.current = false
      setAiBusy(false)
      const content = res && res.text
        ? res.text
        : 'Error: ' + ((res && res.error) || 'sin respuesta')
      threadRef.current = [...threadRef.current, { role: 'assistant', content }]
      setThread(threadRef.current)
      setTimeout(() => aiInputRef.current && aiInputRef.current.focus(), 0)
      return
    }
    if (suggestions[selected]) {
      pick(suggestions[selected])
      return
    }
    let target = resolveTarget(raw)
    if (!target && e.ctrlKey && /^[\w-]+$/.test(raw)) target = 'https://' + raw + '.com'
    if (!target) target = await window.api.searchUrl(raw)
    setOpen(false)
    if (e.altKey) {
      window.api.openNewTab(target)
      if (inputRef.current) inputRef.current.blur()
      return
    }
    onNavigate(target)
    if (inputRef.current) inputRef.current.blur()
  }

  async function aiFollowUp(e) {
    e.preventDefault()
    const el = aiInputRef.current
    if (!el) return
    const text = el.value.trim()
    if (!text || aiBusyRef.current) return
    el.value = ''
    const userMsg = { role: 'user', content: text }
    threadRef.current = [...threadRef.current, userMsg]
    setThread(threadRef.current)
    setAiBusy(true)
    aiBusyRef.current = true
    const res = await window.api.aiChat(threadRef.current)
    aiBusyRef.current = false
    setAiBusy(false)
    const content = res && res.text ? res.text : 'Error: ' + ((res && res.error) || 'sin respuesta')
    threadRef.current = [...threadRef.current, { role: 'assistant', content }]
    setThread(threadRef.current)
  }

  function onKeyDown(e) {
    if (aiMode || value.trim().startsWith('/')) return
    if (e.key === 'Enter' && e.altKey) {
      e.preventDefault()
      const raw = value.trim()
      if (!raw) return
      const target = resolveTarget(raw) || 'https://www.google.com/search?q=' + encodeURIComponent(raw)
      window.api.openNewTab(target)
      setOpen(false)
      return
    }
    if (e.key === 'Tab' && inlineValue) {
      e.preventDefault()
      setValue(inlineValue)
      return
    }
    if (e.key === 'ArrowRight' && inlineValue && !open) {
      e.preventDefault()
      setValue(inlineValue)
      return
    }
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => (s + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => (s - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current.blur()
    }
  }

  const lower = value.trim().toLowerCase()
  let inlineValue = ''
  if (focused && value && value === value.trim() && suggestions.length) {
    const hostPart = (u) => {
      let s = (u || '').toLowerCase()
      s = s.replace(/^https?:\/\//, '')
      return s.split('/')[0].replace(/^www\./, '')
    }
    const first = suggestions.find((s) => {
      const u = (s.url || '').toLowerCase()
      return u.startsWith(lower) || hostPart(s.url).startsWith(lower)
    })
    if (first && first.url.length > lower.length) inlineValue = first.url
  }

  function pick(item) {
    setOpen(false)
    onNavigate(item.url)
    if (inputRef.current) inputRef.current.blur()
  }

  return (
    <div className="address-bar">
      <form className={'bar-input' + (isInternal ? ' internal' : '')} onSubmit={submit}>
        {isInternal && (
          <span className="internal-chip" title={internalUrl}>{internalLabel}</span>
        )}
        {defaultEngine && (
          <>
            <button
              type="button"
              className="engine-chip"
              title={'Buscar con ' + defaultEngine.name + ' · cambiar motor'}
              onClick={() => setEngOpen((o) => !o)}
            >
              {defaultEngine.name.slice(0, 1).toUpperCase()}
            </button>
            {engOpen && (
              <div className="engine-menu">
                {engines.map((e) => (
                  <button
                    key={e.id}
                    className={'engine-item' + (e.id === defaultEngine.id ? ' active' : '')}
                    onMouseDown={(ev) => {
                      ev.preventDefault()
                      setDefaultEngine(e)
                      setEngOpen(false)
                      window.api.setSetting({ defaultSearchEngine: e.id })
                    }}
                  >
                    <span className="engine-letter">{e.name.slice(0, 1).toUpperCase()}</span>
                    <span className="engine-name">{e.name}</span>
                    {e.id === defaultEngine.id && <span className="engine-check">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {!isInternal && security && (
          <button
            type="button"
            className={'sec-chip ' + security.kind}
            title={security.label}
            onClick={(e) => onSiteInfo(e.currentTarget)}
          >
            {security.icon}
          </button>
        )}
        <div className="inline-zone">
          {inlineValue && <span className="inline-ghost">{inlineValue}</span>}
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={(e) => { setFocused(true); e.target.select() }}
            onBlur={() => { setFocused(false); setTimeout(() => setOpen(false), 150) }}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoComplete="off"
            placeholder={isInternal ? internalUrl : 'Buscar o escribir una dirección'}
          />
        </div>
        <span className="bar-actions">
          {!isInternal && (
            <button type="button" className="bar-btn shield-btn" title="Protecciones de este sitio" onClick={(e) => onShields(e.currentTarget)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5l8-3z" />
              </svg>
            </button>
          )}
          {navState.isLoading ? (
            <button type="button" className="bar-btn" title="Detener" onClick={() => onNavAction('stop')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button type="button" className="bar-btn" title="Recargar (Ctrl+R)" onClick={() => onNavAction('reload')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 4v6h-6" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
          )}
          <button
            type="button"
            className={'bar-btn ai-btn' + (aiMode ? ' on' : '')}
            title="Preguntar a la IA (o escribe /)"
            onClick={toggleAi}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l1.6 4.6L18 8l-4.4 1.4L12 14l-1.6-4.6L6 8l4.4-1.4z" />
              <path d="M18.5 13l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" opacity="0.7" />
              <path d="M5 14l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" opacity="0.7" />
            </svg>
          </button>
        </span>
      </form>

      {open && !aiMode && suggestions.length > 0 && (
        <div className="autocomplete">
          {suggestions.map((s, i) => (
            <div
              key={i}
              className={'suggestion' + (i === selected ? ' selected' : '')}
              onMouseDown={(e) => {
                e.preventDefault()
                pick(s)
              }}
            >
              <span className={'sug-type ' + s.type}>
                {s.type === 'history' ? 'H' : s.type === 'bookmark' ? 'B' : s.type === 'url' ? '→' : 'S'}
              </span>
              <span className="sug-title">{s.title}</span>
              <span className="sug-url">{s.meta || s.url}</span>
            </div>
          ))}
        </div>
      )}

      {aiMode && (
        <div className="ai-panel">
          <div className="ai-head">
            <span className="ai-title">Asistente IA</span>
            <button className="bar-btn" title="Cerrar" onClick={() => setAiMode(false)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="ai-thread">
            {thread.length === 0 && !aiBusy && (
              <div className="ai-empty">
                Pregunta cualquier cosa. Ejemplos: "Explica qué es el DOM", "Resume https://es.wikipedia.org/wiki/Chromium", "Escribe un poema sobre Linux".
              </div>
            )}
            {thread.map((m, i) => (
              <div key={i} className={'ai-msg ' + m.role}>
                {m.content}
              </div>
            ))}
            {aiBusy && <div className="ai-msg assistant ai-thinking">Pensando…</div>}
          </div>
          <form className="ai-input" onSubmit={aiFollowUp}>
            <input ref={aiInputRef} placeholder="Escribe un mensaje…" spellCheck={false} />
            <button type="submit" className="bar-btn" title="Enviar">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13" />
                <path d="M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

function securityFor(url) {
  if (!url) return null
  if (url.startsWith('https://')) {
    return { kind: 'secure', label: 'Conexión segura', icon: <LockIcon /> }
  }
  if (url.startsWith('http://')) {
    return { kind: 'insecure', label: 'Conexión no segura', icon: <InfoIcon /> }
  }
  return null
}

function LockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  )
}

