import { useEffect, useState } from 'react'
import { Modal } from './Modal.jsx'

export default function TaskManager({ onClose, onKill }) {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [desc, setDesc] = useState(true)

  useEffect(() => {
    let alive = true
    async function tick() {
      try {
        const r = await window.api.taskManagerList()
        if (!alive) return
        setRows(r.rows)
        setTotal(r.total)
      } catch {}
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])

  const sorted = [...rows].sort((a, b) => (desc ? b.mem - a.mem : a.mem - b.mem))
  const max = Math.max(1, ...rows.map((r) => r.mem))

  return (
    <Modal
      title="Administrador de tareas"
      onClose={onClose}
      footer={
        <button className="btn" onClick={onClose}>Cerrar</button>
      }
    >
      <table className="tm-table">
        <thead>
          <tr>
            <th>Página</th>
            <th style={{ cursor: 'pointer' }} onClick={() => setDesc((d) => !d)}>Memoria {desc ? '▼' : '▲'}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id}>
              <td>
                <div className="tm-title">{r.title}</div>
                <div className="tm-url">{r.url || ''}</div>
              </td>
              <td className="tm-mem">
                <div className="mem-bar">
                  <div className="mem-fill" style={{ width: Math.max(4, Math.round((r.mem / max) * 100)) + '%' }} />
                </div>
                {fmtMem(r.mem)}
              </td>
              <td>
                <button className="bar-btn" title="Finalizar" onClick={() => onKill(r.id)}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="tm-total">Memoria total: {fmtMem(total)}</div>
    </Modal>
  )
}

function fmtMem(bytes) {
  if (!bytes) return '0 MB'
  return (bytes / 1048576).toFixed(0) + ' MB'
}
