import { useEffect, useState } from 'react'
import ContextMenu from './ContextMenu.jsx'
import { I } from './icons.jsx'

export default function BookmarksBar({ bookmarks, onNavigate, onRemove, onOverlayChange = () => {}, onNewUrl }) {
  const [menu, setMenu] = useState(null)

  useEffect(() => {
    onOverlayChange(!!menu)
  }, [menu, onOverlayChange])

  const menuItems = menu
    ? [
        { icon: I.open, label: 'Abrir en esta pestaña', action: () => onNavigate(menu.bookmark.url) },
        { icon: I.plus, label: 'Abrir en pestaña nueva', action: () => onNewUrl(menu.bookmark.url) },
        { sep: true },
        { icon: I.trash, label: 'Quitar marcador', action: () => onRemove(menu.bookmark.id, menu.bookmark.title), danger: true },
      ]
    : []

  const folderless = bookmarks.filter((b) => !b.folder).slice(0, 30)
  const folders = Array.from(new Set(bookmarks.map((b) => b.folder).filter(Boolean)))

  return (
    <div className="bookmarks-bar">
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
          onContextMenu={(e) => {
            e.preventDefault()
            setMenu({ x: e.clientX, y: e.clientY, bookmark: b })
          }}
        >
          <span className="bm-dot" />
          <span className="bm-name">{b.title || b.url}</span>
        </div>
      ))}
      {bookmarks.length === 0 && <span className="bm-empty">Los sitios que marques con la estrella aparecerán aquí</span>}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      )}
    </div>
  )
}

