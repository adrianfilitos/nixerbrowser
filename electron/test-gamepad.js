const { app } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')

app.disableHardwareAcceleration()

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  await delay(300)
  const core = await import(pathToFileURL(path.join(__dirname, '..', 'src', 'components', 'gamepadCore.mjs')).href)
  const BTN = core.BTN
  const fails = []
  const eq = (label, got, want) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      fails.push(label + ' got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want))
    }
  }
  const eqApprox = (label, got, want, eps = 1e-9) => {
    if (Math.abs(got - want) > eps) {
      fails.push(label + ' got=' + got + ' want=' + want)
    }
  }

  eq('A click', core.resolvePress(BTN.A, []), { type: 'action', name: 'confirm' })
  eq('B click der', core.resolvePress(BTN.B, []), { type: 'action', name: 'cancel' })
  eq('X doble click', core.resolvePress(BTN.X, []), { type: 'action', name: 'double' })
  eq('Y arrastrar', core.resolvePress(BTN.Y, []), { type: 'drag', down: true })
  eq('RB tabNext', core.resolvePress(BTN.RB, []), { type: 'action', name: 'tabNext' })
  eq('Dpad up', core.resolvePress(BTN.DPAD_UP, []), { type: 'action', name: 'up' })
  eq('Dpad left', core.resolvePress(BTN.DPAD_LEFT, []), { type: 'action', name: 'left' })
  eq('Start palette', core.resolvePress(BTN.START, []), { type: 'action', name: 'palette' })
  eq('Back hints', core.resolvePress(BTN.BACK, []), { type: 'action', name: 'hints' })
  eq('Guide hud', core.resolvePress(BTN.GUIDE, []), { type: 'action', name: 'hud' })
  eq('LB solo (modifier)', core.resolvePress(BTN.LB, []), { type: 'modifier', name: 'lb' })

  eq('LB+A zoomIn', core.resolvePress(BTN.A, [BTN.LB]), { type: 'action', name: 'zoomIn' })
  eq('LB+B zoomOut', core.resolvePress(BTN.B, [BTN.LB]), { type: 'action', name: 'zoomOut' })
  eq('LB+X play/pausa', core.resolvePress(BTN.X, [BTN.LB]), { type: 'action', name: 'mediaPlayPause' })
  eq('LB+Y cerrar pestaña', core.resolvePress(BTN.Y, [BTN.LB]), { type: 'action', name: 'tabClose' })
  eq('LB+RB nueva pestaña', core.resolvePress(BTN.RB, [BTN.LB]), { type: 'action', name: 'tabNew' })
  eq('LB+dpadIzq seek', core.resolvePress(BTN.DPAD_LEFT, [BTN.LB]), { type: 'action', name: 'mediaSeekBack' })
  eq('LB+dpadDer seek fwd', core.resolvePress(BTN.DPAD_RIGHT, [BTN.LB]), { type: 'action', name: 'mediaSeekFwd' })
  eq('LB+dpadArr volumen', core.resolvePress(BTN.DPAD_UP, [BTN.LB]), { type: 'action', name: 'mediaVolUp' })
  eq('LB+Start osk', core.resolvePress(BTN.START, [BTN.LB]), { type: 'action', name: 'osk' })

  eq('Release LB tap = tabPrev', core.resolveRelease(BTN.LB, false), { type: 'action', name: 'tabPrev' })
  eq('Release LB chord = null', core.resolveRelease(BTN.LB, true), null)
  eq('Release Y = fin drag', core.resolveRelease(BTN.Y, false), { type: 'drag', down: false })
  eq('Release Y chord = null', core.resolveRelease(BTN.Y, true), null)

  eq('deadzone filtra 0.1', core.applyDeadzone(0.1), 0)
  eqApprox('deadzone escala 0.9', core.applyDeadzone(0.9), (0.9 - 0.3) / 0.7)
  eq('inDeadzone 0.2', core.inDeadzone(0.2), true)

  const c0 = { x: 100, y: 100, maxX: 1000, maxY: 800 }
  eq('cursor sin input no se mueve', core.moveCursor(c0, 0, 0, 1 / 60), c0)
  const c2 = core.moveCursor(c0, 1, 0, 1 / 60)
  eq('cursor se mueve en X', c2.x > 100, true)
  eq('cursor se mueve en Y', c2.y > 99, true)
  eq('cursor clamp en max', core.moveCursor({ x: 1000, y: 100, maxX: 1000, maxY: 800 }, 1, 0, 1).x, 1000)

  eq('stick der hacia arriba = scroll up', core.axisScroll(0, -1, 1 / 60).dy < 0, true)
  eq('stick der hacia abajo = scroll down', core.axisScroll(0, 1, 1 / 60).dy > 0, true)
  eq('stick der hacia der = scroll right', core.axisScroll(1, 0, 1 / 60).dx > 0, true)
  eq('LT = scroll up', core.triggerScroll(1, 0, 1 / 60).dy < 0, true)
  eq('RT = scroll down', core.triggerScroll(0, 1, 1 / 60).dy > 0, true)

  if (fails.length) console.log('GAMEPAD_FAILS:\n- ' + fails.join('\n- '))
  const ok = fails.length === 0
  console.log('RESULT:', ok ? 'GAMEPAD_OK' : 'GAMEPAD_FAIL')
  app.exit(ok ? 0 : 1)
}).catch((e) => {
  console.log('ERR', e && e.stack)
  app.exit(2)
})
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 30000)
