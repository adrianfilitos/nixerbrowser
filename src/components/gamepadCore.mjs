export const DEADZONE = 0.3

export const BTN = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7,
  BACK: 8, START: 9, LSTICK: 10, RSTICK: 11,
  DPAD_UP: 12, DPAD_DOWN: 13, DPAD_LEFT: 14, DPAD_RIGHT: 15,
  GUIDE: 16,
}

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v
}

export function inDeadzone(v, dz = DEADZONE) {
  return Math.abs(v) < dz
}

export function applyDeadzone(v, dz = DEADZONE) {
  const a = Math.abs(v)
  if (a < dz) return 0
  return Math.sign(v) * ((a - dz) / (1 - dz))
}

export function resolvePress(idx, held) {
  const lb = held.includes(BTN.LB)
  switch (idx) {
    case BTN.A: return lb ? { type: 'action', name: 'zoomIn' } : { type: 'action', name: 'confirm' }
    case BTN.B: return lb ? { type: 'action', name: 'zoomOut' } : { type: 'action', name: 'cancel' }
    case BTN.X: return lb ? { type: 'action', name: 'mediaPlayPause' } : { type: 'action', name: 'double' }
    case BTN.Y: return lb ? { type: 'action', name: 'tabClose' } : { type: 'drag', down: true }
    case BTN.RB: return lb ? { type: 'action', name: 'tabNew' } : { type: 'action', name: 'tabNext' }
    case BTN.LB: return { type: 'modifier', name: 'lb' }
    case BTN.BACK: return lb ? null : { type: 'action', name: 'hints' }
    case BTN.START: return lb ? { type: 'action', name: 'osk' } : { type: 'action', name: 'palette' }
    case BTN.GUIDE: return lb ? null : { type: 'action', name: 'hud' }
    case BTN.DPAD_UP: return lb ? { type: 'action', name: 'mediaVolUp' } : { type: 'action', name: 'up' }
    case BTN.DPAD_DOWN: return lb ? { type: 'action', name: 'mediaVolDown' } : { type: 'action', name: 'down' }
    case BTN.DPAD_LEFT: return lb ? { type: 'action', name: 'mediaSeekBack' } : { type: 'action', name: 'left' }
    case BTN.DPAD_RIGHT: return lb ? { type: 'action', name: 'mediaSeekFwd' } : { type: 'action', name: 'right' }
    default: return null
  }
}

export function resolveRelease(idx, chordHappened) {
  if (idx === BTN.LB) return chordHappened ? null : { type: 'action', name: 'tabPrev' }
  if (idx === BTN.Y) return chordHappened ? null : { type: 'drag', down: false }
  return null
}

export function moveCursor(cursor, dx, dy, dt) {
  const ax = applyDeadzone(dx)
  const ay = applyDeadzone(dy)
  const mag = Math.hypot(ax, ay)
  if (mag < 0.001 || dt <= 0 || cursor.maxX == null || cursor.maxY == null) return cursor
  const speed = 1900 * mag * mag * dt
  return {
    ...cursor,
    x: clamp(cursor.x + (ax / mag) * speed, 0, cursor.maxX),
    y: clamp(cursor.y + (ay / mag) * speed, 0, cursor.maxY),
  }
}

export function axisScroll(dx, dy, dt) {
  const ax = applyDeadzone(dx)
  const ay = applyDeadzone(dy)
  const base = 1600 * (dt || 1 / 60)
  return { dx: ax * Math.abs(ax) * base, dy: ay * Math.abs(ay) * base }
}

export function triggerScroll(lt, rt, dt) {
  const a = applyDeadzone(rt) - applyDeadzone(lt)
  const base = 1600 * (dt || 1 / 60)
  return { dx: 0, dy: a * Math.abs(a) * base }
}
