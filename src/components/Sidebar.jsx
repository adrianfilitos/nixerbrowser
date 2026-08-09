import { useEffect, useState } from 'react'

const TABS = [
  { id: 'bookmarks', label: 'Marcadores' },
  { id: 'history', label: 'Historial' },
  { id: 'downloads', label: 'Descargas' },
]

export default function Sidebar({ tab, onTab, onNavigate, onClose }) {
  const [items, setItems] = useState([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (tab === 'bookmarks') window.api.getBookmarks().then(setItems)
    else if (tab === 'history') window.api.autocomplete('').then(() => {})
  }, [tab])

  async function refreshHistory() {
    try { setItems(await window.api.autocomplete('').then(() => [])) } catch {}
  }

  useEffect(() => {
    if (tab === 'history') {
      window.api.getSettings().then(() => {})
    }
  }, [tab])

  const filtered = (tab === 'bookmarks' ? items : []).filter((b) => {
    if (!query) return !b.folder
    return (b.title + ' ' + b.url).toLowerCase().includes(query.toLowerCase())
  })

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="sidebar-tabs">
          {TABS.map((t) => (
            <button key={t.id} className={'sb-tab' + (tab === t.id ? ' active' : '')} onClick={() => onTab(t.id)}>{t.label}</button>
          ))}
        </div>
        <button className="sidebar-close" title="Cerrar barra lateral" onClick={onClose}>✕</button>
      </div>
      <input className="sidebar-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar…" />
      <div className="sidebar-list">
        {tab === 'bookmarks' && filtered.length === 0 && <div className="sb-empty">Sin marcadores</div>}
        {tab === 'bookmarks' && filtered.map((b) => (
          <div key={b.id} className="sb-item" title={b.url} onClick={() => onNavigate(b.url)}>
            <span className="sb-dot" />
            <span className="sb-name">{b.title || b.url}</span>
          </div>
        ))}
        {tab === 'history' && <div className="sb-empty">Usa Ctrl+H para el historial completo</div>}
        {tab === 'downloads' && <div className="sb-empty">Usa Ctrl+J para las descargas</div>}
      </div>
    </aside>
  )
}
