import { useEffect, useRef } from 'react'
import { BTN, moveCursor, axisScroll, triggerScroll, resolvePress, resolveRelease } from './gamepadCore.mjs'

export function rumble(duration = 50, strong = 0.4, weak = 0.4) {
  try {
    const gps = navigator.getGamepads ? navigator.getGamepads() : []
    const gp = Array.from(gps).find((g) => g && g.connected)
    if (gp && gp.vibrationActuator && gp.vibrationActuator.playEffect) {
      gp.vibrationActuator.playEffect('dual-rumble', { startDelay: 0, duration, strongMagnitude: strong, weakMagnitude: weak }).catch(() => {})
    }
  } catch {}
}

export function useGamepad({ enabled, onEvent, onConnect, onDisconnect, onNonStandard, onActivity, cursorRef }) {
  const refs = useRef({})
  refs.current.onEvent = onEvent
  refs.current.onConnect = onConnect
  refs.current.onDisconnect = onDisconnect
  refs.current.onNonStandard = onNonStandard
  refs.current.onActivity = onActivity

  const stateRef = useRef({
    cursor: null,
    pressed: [],
    lbChord: false,
    dragActive: false,
    connected: false,
  })

  useEffect(() => {
    if (!enabled) return
    let alive = true
    let raf = 0
    let last = performance.now()

    function emit(ev) {
      if (alive) refs.current.onEvent && refs.current.onEvent(ev)
    }

    function activity() {
      refs.current.onActivity && refs.current.onActivity()
    }

    function ensureCursor() {
      const st = stateRef.current
      if (!st.cursor) {
        st.cursor = { x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight / 2), visible: true }
        if (cursorRef) cursorRef.current = st.cursor
      }
      st.cursor.maxX = Math.max(0, window.innerWidth - 1)
      st.cursor.maxY = Math.max(0, window.innerHeight - 1)
      st.cursor.visible = true
      return st.cursor
    }

    function onConnected(gp) {
      const st = stateRef.current
      st.connected = true
      st.dragActive = false
      ensureCursor()
      refs.current.onConnect && refs.current.onConnect(gp)
      if (gp && gp.mapping !== 'standard') {
        refs.current.onNonStandard && refs.current.onNonStandard(gp)
      }
    }

    function onDisconnected(gp) {
      const st = stateRef.current
      st.connected = false
      st.pressed = []
      st.lbChord = false
      st.dragActive = false
      if (st.cursor) st.cursor.visible = false
      refs.current.onDisconnect && refs.current.onDisconnect(gp)
    }

    function onConnEv(e) {
      if (!stateRef.current.connected) onConnected(e.gamepad)
    }
    function onDisEv(e) {
      if (stateRef.current.connected) onDisconnected(e.gamepad)
    }

    window.addEventListener('gamepadconnected', onConnEv)
    window.addEventListener('gamepaddisconnected', onDisEv)

    function tick(now) {
      if (!alive) return
      const dt = Math.min(Math.max((now - last) / 1000, 0), 0.05)
      last = now
      const gps = navigator.getGamepads ? navigator.getGamepads() : []
      const gp = Array.from(gps).find((g) => g && g.connected)
      const st = stateRef.current
      if (!gp) {
        if (st.connected) onDisconnected(null)
        raf = requestAnimationFrame(tick)
        return
      }
      if (!st.connected) onConnected(gp)

      const cursor = ensureCursor()
      const ax = gp.axes[0] || 0
      const ay = gp.axes[1] || 0
      let moved = false
      if (Math.abs(ax) > 0.02 || Math.abs(ay) > 0.02) {
        const n = moveCursor(cursor, ax, ay, dt)
        cursor.x = n.x
        cursor.y = n.y
        emit({ type: 'pointer', x: cursor.x, y: cursor.y })
        activity()
        moved = true
      }

      const rx = gp.axes[2] || 0
      const ry = gp.axes[3] || 0
      const lt = gp.axes[4] || 0
      const rt = gp.axes[5] || 0
      const as = axisScroll(rx, ry, dt)
      const ts = triggerScroll(lt, rt, dt)
      const sdx = as.dx + ts.dx
      const sdy = as.dy + ts.dy
      if (Math.abs(sdx) > 1 || Math.abs(sdy) > 1) {
        emit({ type: 'scroll', dx: sdx, dy: sdy })
        activity()
        moved = true
      }

      const btn = gp.buttons
      for (let i = 0; i < btn.length; i++) {
        const pressed = !!btn[i].pressed
        const was = !!st.pressed[i]
        if (pressed === was) continue
        if (pressed) {
          if (i === BTN.LB) {
            st.lbChord = false
          } else {
            const lbHeld = !!st.pressed[BTN.LB]
            if (lbHeld) st.lbChord = true
            const r = resolvePress(i, lbHeld ? [BTN.LB] : [])
            if (r && r.type === 'action') emit({ type: 'action', name: r.name })
            else if (r && r.type === 'drag') {
              st.dragActive = true
              emit({ type: 'drag', down: true, x: cursor.x, y: cursor.y })
            }
          }
          st.pressed[i] = true
          activity()
        } else {
          const chord = st.lbChord
          if (i === BTN.LB) st.lbChord = false
          const r = resolveRelease(i, chord)
          if (r && r.type === 'action') emit({ type: 'action', name: r.name })
          else if (r && r.type === 'drag') {
            st.dragActive = false
            emit({ type: 'drag', down: false, x: cursor.x, y: cursor.y })
          }
          st.pressed[i] = false
          if (i === BTN.Y) st.dragActive = false
          activity()
        }
      }

      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      window.removeEventListener('gamepadconnected', onConnEv)
      window.removeEventListener('gamepaddisconnected', onDisEv)
    }
  }, [enabled, cursorRef])
}
