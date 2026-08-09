const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-drag-real')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 20 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  await delay(1500)
  await ui.executeJavaScript(`document.querySelector('.new-tab').click(); true`)
  await delay(1200)
  await ui.executeJavaScript(`document.querySelector('.new-tab').click(); true`)
  await delay(1200)

  const count0 = await ui.executeJavaScript(`document.querySelectorAll('.tab').length`)
  const rects = await ui.executeJavaScript(`Array.from(document.querySelectorAll('.tab')).slice(0,2).map(t => { const r = t.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) } })`)
  // simular arrastre de tab0 sobre tab1: no debe mover la ventana ni crear pestañas
  const from = rects[0]
  const to = rects[1]
  const pos0 = win.getPosition()
  ui.sendInputEvent({ type: 'mouseDown', x: from.x, y: from.y, button: 'left', clickCount: 1 })
  for (let i = 1; i <= 25; i++) {
    ui.sendInputEvent({ type: 'mouseMove', x: Math.round(from.x + (to.x - from.x) * (i / 25)), y: from.y, button: 'left', buttons: 1, movementX: 2, movementY: 0 })
    await delay(20)
  }
  await delay(300)
  ui.sendInputEvent({ type: 'mouseUp', x: to.x, y: to.y, button: 'left', clickCount: 1 })
  await delay(600)

  const count1 = await ui.executeJavaScript(`document.querySelectorAll('.tab').length`)
  const pos1 = win.getPosition()
  const region = await ui.executeJavaScript(`(() => { const s = document.querySelector('.tab-strip'); const g = document.querySelector('.tab-strip-drag'); return { strip: getComputedStyle(s).webkitAppRegion, gutter: g ? getComputedStyle(g).webkitAppRegion : null } })()`)
  const ok = count0 === count1 && JSON.stringify(pos0) === JSON.stringify(pos1) && region.strip !== 'drag' && region.gutter === 'drag'
  console.log('DRAG_REAL:', JSON.stringify({ count0, count1, moved: JSON.stringify(pos0) !== JSON.stringify(pos1), region, ok }))
  console.log('RESULT:', ok ? 'DRAG_REAL_OK' : 'DRAG_REAL_FAIL')
  win.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
