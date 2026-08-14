import { useEffect, useRef, useState } from 'react'

export default function AIPanel({ tabs = [], onClose, onOpenLink }) {
  const [thread, setThread] = useState([])
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState('')
  const [atSugg, setAtSugg] = useState(null)
  const threadRef = useRef([])
  const listRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [thread, busy])

  async function send(text, context) {
    const userMsg = { role: 'user', content: context ? text + '\n\n' + context : text }
    threadRef.current = [...threadRef.current, userMsg]
    setThread(threadRef.current)
    setInput('')
    setBusy(true)
    let res = null
    try { res = await window.api.aiChat(threadRef.current) } catch (err) { res = { error: String(err && err.message || err) } }
    setBusy(false)
    const out = res && res.text ? res.text : 'Error: ' + ((res && res.error) || 'sin respuesta')
    threadRef.current = [...threadRef.current, { role: 'assistant', content: out }]
    setThread(threadRef.current)
  }

  function lastUserText() {
    for (let i = threadRef.current.length - 1; i >= 0; i--) {
      if (threadRef.current[i].role === 'user') return threadRef.current[i].content
    }
    return ''
  }

  function onInputChange(value) {
    setInput(value)
    const m = value.match(/@([\w\s.\-]*)$/)
    if (m) {
      const token = m[1].trim().toLowerCase()
      const list = (tabs || [])
        .filter((t) => (t.title || '').toLowerCase().includes(token) || (t.url || '').toLowerCase().includes(token))
        .slice(0, 8)
        .map((t) => ({ title: t.title || 'Nueva pestaña', url: t.url || '', at: m[1] }))
      setAtSugg(token === '' ? (tabs || []).slice(0, 8).map((t) => ({ title: t.title || 'Nueva pestaña', url: t.url || '', at: m[1] })) : list)
    } else {
      setAtSugg(null)
    }
  }

  function pickAt(sugg) {
    const caret = input.lastIndexOf('@')
    const replaced = input.slice(0, caret) + '@' + sugg.title
    setInput(replaced + ' ')
    setAtSugg(null)
    if (inputRef.current) inputRef.current.focus()
  }

  function submit(e) {
    e.preventDefault()
    const v = input.trim()
    if (!v || busy) return
    setAtSugg(null)
    send(v)
  }

  async function summarize() {
    if (busy) return
    const ctx = await window.api.aiPageContext().catch(() => null)
    if (!ctx || !ctx.text) {
      send('No pude leer esta página: sin texto extraíble o página sin contenido.')
      return
    }
    send('Resume esta página en unas pocas frases claras:\n\nTítulo: ' + ctx.title + '\nURL: ' + ctx.url + '\n\n' + ctx.text.slice(0, 12000))
  }

  async function searchWebAction() {
    if (busy) return
    const q = (input.trim() || lastUserText()).replace(/^(busca|search)( en internet| on the internet)?:?\s*/i, '').trim()
    if (!q) return
    setInput('')
    setBusy(true)
    const results = await window.api.aiSearch(q).catch(() => [])
    const context = results.length
      ? 'Resultados de búsqueda para "' + q + '":\n' + results.map((r, i) => (i + 1) + '. ' + r.title + ' — ' + r.url + '\n' + r.snippet).join('\n\n')
      : 'No se encontraron resultados para "' + q + '".'
    const userMsg = { role: 'user', content: 'Busca en Internet: ' + q + '\n\n' + context }
    threadRef.current = [...threadRef.current, userMsg]
    setThread(threadRef.current)
    let res = null
    try { res = await window.api.aiChat(threadRef.current) } catch (err) { res = { error: String(err && err.message || err) } }
    setBusy(false)
    const out = res && res.text ? res.text : 'Error: ' + ((res && res.error) || 'sin respuesta')
    threadRef.current = [...threadRef.current, { role: 'assistant', content: out }]
    setThread(threadRef.current)
  }

  async function pageContext() {
    if (busy) return
    const ctx = await window.api.aiPageContext().catch(() => null)
    if (!ctx || (!ctx.text && !ctx.url)) {
      send('Contexto del navegador: la página actual no tiene contenido extraíble.')
      return
    }
    send('Contexto del navegador (página actual):', 'Título: ' + ctx.title + '\nURL: ' + ctx.url + '\n\n' + (ctx.text ? ctx.text.slice(0, 8000) : ''))
  }

  return (
    <div className="ai-dock">
      <div className="ai-dock-head">
        <span className="ai-dock-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l1.6 4.6L18 8l-4.4 1.4L12 14l-1.6-4.6L6 8l4.4-1.4z" />
            <path d="M18.5 13l.9 2.6 2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9z" opacity="0.7" />
            <path d="M5 14l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z" opacity="0.7" />
          </svg>
          Asistente IA
        </span>
        <div className="ai-dock-actions">
          <button className="ai-dock-act" title="Resumir la página actual" onClick={summarize}>Resumir</button>
          <button className="ai-dock-act" title="Usar el contexto de la página actual" onClick={pageContext}>Contexto</button>
          <button className="ai-dock-act" title="Buscar en Internet y responder" onClick={searchWebAction}>Buscar</button>
          <button className="bar-btn ai-dock-close" title="Cerrar" onClick={onClose}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
      <div className="ai-dock-thread" ref={listRef}>
        {thread.length === 0 && !busy && (
          <div className="ai-dock-empty">
            Pregunta lo que quieras, pide un resumen de esta página o busca en Internet.<br />
            Las URLs de las respuestas se abren como pestañas.
          </div>
        )}
        {thread.map((m, i) => (
          <div key={i} className={'ai-dock-msg ' + m.role}>{renderMsg(m.content, onOpenLink)}</div>
        ))}
        {busy && <div className="ai-dock-msg assistant ai-dock-thinking">Buscando y pensando…</div>}
      </div>
      {atSugg && (
        <div className="ai-dock-at">
          {atSugg.map((s, i) => (
            <button key={i} type="button" className="ai-dock-at-item" onClick={() => pickAt(s)}>
              <span className="ai-dock-at-title">{s.title}</span>
              <span className="ai-dock-at-url">{s.url}</span>
            </button>
          ))}
        </div>
      )}
      <form className="ai-dock-input" onSubmit={submit}>
        <input ref={inputRef} value={input} onChange={(e) => onInputChange(e.target.value)} placeholder="Escribe un mensaje… (usa @ para nombrar una pestaña)" spellCheck={false} />
        <button type="submit" className="bar-btn" title="Enviar">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13" />
            <path d="M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </form>
    </div>
  )
}

function renderMsg(text, onOpenLink) {
  if (typeof text !== 'string') return text
  const out = []
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"')]+)/g
  let last = 0
  let m
  let key = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1] && m[2]) {
      out.push(<a key={key++} className="ai-dock-link" href="#" onClick={(e) => { e.preventDefault(); if (onOpenLink) onOpenLink(m[2]) }}>{m[1]}</a>)
    } else if (m[3]) {
      const url = m[3].replace(/[.,;:!?]+$/, '')
      out.push(<a key={key++} className="ai-dock-link" href="#" onClick={(e) => { e.preventDefault(); if (onOpenLink) onOpenLink(url) }}>{url}</a>)
    }
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
