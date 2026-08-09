import { useEffect, useRef } from 'react'

export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    function close(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    function key(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', key)
    window.addEventListener('blur', onClose)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', key)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  const style = {
    left: Math.min(x, window.innerWidth - 250),
    top: Math.min(y, window.innerHeight - items.length * 36 - 16),
  }

  return (
    <div className="ctx-menu" style={style} ref={ref}>
      {items.map((it, i) =>
        it.sep ? (
          <div key={i} className="ctx-sep" />
        ) : (
          <button
            key={i}
            className={'ctx-item' + (it.danger ? ' danger' : '')}
            onClick={() => {
              onClose()
              it.action()
            }}
          >
            <span className="ctx-icon">{it.icon || <span className="ctx-dot" />}</span>
            <span className="ctx-label">{it.label}</span>
            {it.accel && <span className="ctx-accel">{it.accel}</span>}
          </button>
        )
      )}
    </div>
  )
}
