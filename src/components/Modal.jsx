import { useEffect, useState } from 'react'

export function Modal({ title, children, onClose, footer }) {
  useEffect(() => {
    function key(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="bar-btn" onClick={onClose} title="Cerrar (Esc)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmModal({ title, message, confirmLabel, danger, onConfirm, onCancel }) {
  return (
    <Modal
      title={title || 'Confirmar'}
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>Cancelar</button>
          <button className={'btn ' + (danger ? 'danger' : 'primary')} onClick={onConfirm}>
            {confirmLabel || 'Confirmar'}
          </button>
        </>
      }
    >
      <p className="modal-msg">{message}</p>
    </Modal>
  )
}

export function BookmarkModal({ url, initialTitle, onSave, onCancel }) {
  const [title, setTitle] = useState(initialTitle || url)
  return (
    <Modal
      title="Añadir marcador"
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>Cancelar</button>
          <button className="btn primary" onClick={() => onSave(title.trim() || url)}>Guardar</button>
        </>
      }
    >
      <label className="field-label">Título</label>
      <input className="text-input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="modal-url">{url}</div>
    </Modal>
  )
}
