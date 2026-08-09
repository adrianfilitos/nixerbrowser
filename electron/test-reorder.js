const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-reorder-profile')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const wto = (p, ms, tag) => Promise.race([p, new Promise((r) => setTimeout(() => r('TIMEOUT:' + tag), ms))])

app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 20 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  await delay(1500)
  await ui.executeJavaScript(`document.querySelector('.new-tab').click(); true`)
  await delay(1200)
  await ui.executeJavaScript(`document.querySelector('.new-tab').click(); true`)
  await delay(1200)

  const order = () => ui.executeJavaScript(`Array.from(document.querySelectorAll('.tab')).map(t => t.dataset.id)`)
  const before = await wto(order(), 4000, 'before')
  const rects = await ui.executeJavaScript(`Array.from(document.querySelectorAll('.tab')).slice(0,2).map(t => { const r = t.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) } })`)
  const from = rects[0]
  const to = rects[1]

  // drag por puntero: pointerdown → moves → pointerup
  ui.sendInputEvent({ type: 'mouseDown', x: from.x, y: from.y, button: 'left', clickCount: 1 })
  const steps = 20
  for (let i = 1; i <= steps; i++) {
    ui.sendInputEvent({ type: 'mouseMove', x: Math.round(from.x + (to.x - from.x) * (i / steps)), y: from.y, button: 'left', buttons: 1, movementX: 2, movementY: 0 })
    await delay(20)
  }
  await delay(400)
  ui.sendInputEvent({ type: 'mouseUp', x: to.x, y: to.y, button: 'left', clickCount: 1 })
  await delay(800)

  const after = await wto(order(), 4000, 'after')
  const active = await ui.executeJavaScript(`document.querySelector('.tab.active') ? document.querySelector('.tab.active').dataset.id : null`)

  console.log('REORDER:', JSON.stringify({ before, after, from, to, active }))
  const ok = JSON.stringify(before) !== JSON.stringify(after)
  console.log('RESULT:', ok ? 'REORDER_OK' : 'REORDER_FAIL')
  win.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
