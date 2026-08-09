import { useEffect, useRef, useState } from 'react'

export default function Palette({ open, items, onClose }) {
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setSel(0)
      setTimeout(() => inputRef.current && inputRef.current.focus(), 0)
    }
  }, [open])

  if (!open) return null

  const filtered = items.filter((it) => {
    if (it.sep) return false
    const q = query.toLowerCase().trim()
    if (!q) return true
    return (it.label + ' ' + (it.meta || '')).toLowerCase().includes(q)
  })

  function run(item) {
    onClose()
    item.action()
  }

  function onKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(s + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter' && filtered[sel]) {
      run(filtered[sel])
    }
  }

  return (
    <div className="overlay palette-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="palette">
        <svg className="pal-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSel(0) }}
          onKeyDown={onKey}
          placeholder="Escribe una acción o busca una pestaña…"
        />
        <div className="palette-list">
          {filtered.map((it, i) => (
            <button
              key={i}
              className={'pal-item' + (i === sel ? ' selected' : '')}
              onMouseDown={(e) => { e.preventDefault(); run(it) }}
              onMouseEnter={() => setSel(i)}
            >
              <span className="pal-icon">{it.icon}</span>
              <span className="pal-label">{it.label}</span>
              {it.accel && <span className="pal-accel">{it.accel}</span>}
            </button>
          ))}
          {!filtered.length && <div className="pal-empty">Sin resultados</div>}
        </div>
      </div>
    </div>
  )
}
