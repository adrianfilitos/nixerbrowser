import { useEffect, useRef } from 'react'

export default function FindBar({ result, onFind, onStop, onClose }) {
  const inputRef = useRef(null)

  useEffect(() => {
    setTimeout(() => inputRef.current && inputRef.current.focus(), 0)
  }, [])

  function find(findNext) {
    const text = inputRef.current ? inputRef.current.value : ''
    if (!text) {
      onStop()
      return
    }
    onFind(text, !!findNext)
  }

  return (
    <div className="find-bar">
      <input
        ref={inputRef}
        onChange={() => find(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); find(true) }
          else if (e.key === 'Escape') onClose()
        }}
        placeholder="Buscar en página"
        spellCheck={false}
      />
      <span className="find-count">
        {result && result.matches ? (result.activeMatchOrdinal || 0) + ' / ' + result.matches : ''}
      </span>
      <button className="bar-btn" title="Anterior" onClick={() => find(false)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 15l-6-6-6 6" />
        </svg>
      </button>
      <button className="bar-btn" title="Siguiente (Enter)" onClick={() => find(true)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <button className="bar-btn" title="Cerrar (Esc)" onClick={onClose}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
