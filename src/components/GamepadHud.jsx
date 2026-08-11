import { useEffect, useRef } from 'react'

const CHEAT = [
  ['Stick izq', 'Cursor'],
  ['A · B · X · Y', 'Click izq · der · doble · arrastrar'],
  ['RB · LB', 'Pestaña sig · ant'],
  ['LB+RB', 'Nueva pestaña'],
  ['LB+Y', 'Cerrar pestaña'],
  ['D-pad ←/→', 'Atrás / adelante'],
  ['D-pad ↑/↓ · RT/LT', 'Scroll'],
  ['Stick der', 'Scroll'],
  ['Start', 'Paleta de comandos'],
  ['Back', 'Hints de enlaces'],
  ['Botón Xbox', 'Esta ayuda'],
  ['LB+X · LB+←/→ · LB+↑/↓', 'Play/pausa · seek · volumen'],
  ['LB+A · LB+B', 'Zoom + · −'],
  ['LB+Start', 'Teclado virtual'],
]

export default function GamepadHud({ connected, gpName, cursorRef, hints, hintSel, hintActive, hudOpen, idle }) {
  const dotRef = useRef(null)

  useEffect(() => {
    if (!connected || !cursorRef) return
    let raf = 0
    const draw = () => {
      const c = cursorRef.current
      if (c && dotRef.current) {
        dotRef.current.style.transform = 'translate(' + (c.x - 6) + 'px,' + (c.y - 6) + 'px)'
        dotRef.current.style.opacity = c.visible ? (idle ? '0.35' : '1') : '0'
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [connected, cursorRef, idle])

  if (!connected) return null

  return (
    <>
      <div className="gamepad-cursor" ref={dotRef} />
      {hintActive && (
        <div className="gamepad-hints">
          {hints.map((h, i) => (
            <span key={i} className={'gamepad-hint-label' + (i === hintSel ? ' selected' : '')} style={{ left: h.x - 8, top: h.y - 9 }}>
              {h.label}
            </span>
          ))}
        </div>
      )}
      <div className="gamepad-chip" title={gpName || 'Mando conectado'}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7.5 3h9a6.5 6.5 0 016.5 6.5c0 2.6-1.2 3.9-2.5 5.4-1.4 1.6-3 3.1-4.2 3.1-1.4 0-1.9-1.1-3.3-1.1s-1.9 1.1-3.3 1.1c-1.2 0-2.8-1.5-4.2-3.1C1.7 13.4.5 12.1.5 9.5A6.5 6.5 0 017.5 3zm.5 3A1.5 1.5 0 006.5 7.5 1.5 1.5 0 007.5 9 1.5 1.5 0 009 7.5 1.5 1.5 0 008 6zm8 0a1.5 1.5 0 00-1.5 1.5A1.5 1.5 0 0011 7.5 1.5 1.5 0 0012.5 9 1.5 1.5 0 0014 7.5 1.5 1.5 0 0012.5 6zM8.5 10a1 1 0 00-1 1v1.5H6a1 1 0 100 2h1.5V16a1 1 0 102 0v-1.5H11a1 1 0 100-2H9.5V11a1 1 0 00-1-1z"/></svg>
        <span>{gpName || 'Mando'}</span>
      </div>
      {hudOpen && (
        <div className="gamepad-hud">
          <div className="gamepad-hud-title">Atajos del mando</div>
          {CHEAT.map(([k, v]) => (
            <div key={k} className="gamepad-hud-row"><span className="gamepad-hud-key">{k}</span><span>{v}</span></div>
          ))}
        </div>
      )}
    </>
  )
}
