import { useEffect, useState } from 'react'
import ContextMenu from './ContextMenu.jsx'
import { I } from './icons.jsx'

function copyText(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).catch(() => {})
  else {
    const ta = document.createElement('textarea')
    ta.value = t
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch {}
    document.body.removeChild(ta)
  }
}

export default function BookmarksBar({ bookmarks, onNavigate, onRemove, onOverlayChange = () => {}, onNewUrl, onAdd }) {
  const [menu, setMenu] = useState(null)

  useEffect(() => {
    onOverlayChange(!!menu)
  }, [menu, onOverlayChange])

  const menuItems = menu
    ? [
        { icon: I.open, label: 'Abrir en esta pestaña', action: () => onNavigate(menu.bookmark.url) },
        { icon: I.plus, label: 'Abrir en pestaña nueva', action: () => onNewUrl(menu.bookmark.url) },
        { icon: I.window, label: 'Abrir en ventana nueva', action: () => window.api.createWindow(false, menu.bookmark.url) },
        { icon: I.copy, label: 'Copiar URL', action: () => copyText(menu.bookmark.url) },
        { sep: true },
        { icon: I.trash, label: 'Quitar marcador', action: () => onRemove(menu.bookmark.id, menu.bookmark.title), danger: true },
      ]
    : []

  function onDrop(e) {
    e.preventDefault()
    const url = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text/uri-list')
    if (!url || !/^https?:\/\//.test(url)) return
    let host = ''
    try { host = new URL(url).hostname } catch {}
    if (onAdd) onAdd(url, host || url)
  }

  const folderless = bookmarks.filter((b) => !b.folder).slice(0, 30)
  const folders = Array.from(new Set(bookmarks.map((b) => b.folder).filter(Boolean)))

  return (
    <div className="bookmarks-bar" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      {folders.map((f) => (
        <div key={'f:' + f} className="bm-item bm-folder" title={'Carpeta: ' + f + ' (ver marcadores)'} onClick={() => onNavigate('nixer://bookmarks')}>
          <span className="bm-dot" style={{ background: 'var(--accent)' }} />
          <span className="bm-name">{f}</span>
        </div>
      ))}
      {folderless.map((b) => (
        <div
          key={b.id}
          className="bm-item"
          title={b.url}
          onClick={() => onNavigate(b.url)}
          onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onNewUrl(b.url) } }}
          onContextMenu={(e) => {
            e.preventDefault()
            setMenu({ x: e.clientX, y: e.clientY, bookmark: b })
          }}
        >
          <span className="bm-dot" />
          <span className="bm-name">{b.title || b.url}</span>
        </div>
      ))}
      {bookmarks.length === 0 && <span className="bm-empty">Los sitios que marques con la estrella aparecerán aquí · o arrastra una URL</span>}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      )}
    </div>
  )
}

