const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-drag-ghost-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  await delay(1500)
  const waitTabs = async (n) => ui.executeJavaScript(`(async () => { for (let i = 0; i < 60; i++) { if (document.querySelectorAll('.tab').length >= ${n}) return true; await new Promise(r => setTimeout(r, 200)) } return false })()`)
  await waitTabs(1)
  await ui.executeJavaScript(`document.querySelector('.new-tab').click(); true`)
  await waitTabs(2)
  await ui.executeJavaScript(`document.querySelector('.new-tab').click(); true`)
  await waitTabs(3)
  const rects = await ui.executeJavaScript(`Array.from(document.querySelectorAll('.tab')).slice(0,3).map(t => { const r = t.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) } })`)
  if (!rects || rects.length < 2 || !rects[0] || !rects[2]) { console.log('GHOST_TEST: no rects', JSON.stringify(rects)); app.exit(2); return }
  const from = rects[0], to = rects[2]
  const checkGhost = () => ui.executeJavaScript(`(async () => { for (let i = 0; i < 40; i++) { const g = document.querySelector('.tab-drag-ghost'); if (g) return { ghost: true, x: Math.round(g.getBoundingClientRect().left), transform: g.style.transform }; await new Promise(r => setTimeout(r, 100)) } return { ghost: false } })()`)
  ui.sendInputEvent({ type: 'mouseDown', x: from.x, y: from.y, button: 'left', clickCount: 1 })
  for (let i = 1; i <= 30; i++) {
    ui.sendInputEvent({ type: 'mouseMove', x: Math.round(from.x + (to.x - from.x) * (i / 30)), y: from.y, button: 'left', buttons: 1, movementX: 2, movementY: 0 })
    await delay(16)
  }
  const midGhost = await checkGhost()
  const orderMid = await ui.executeJavaScript(`Array.from(document.querySelectorAll('.tab-list .tab')).map(t => t.dataset.id)`)
  ui.sendInputEvent({ type: 'mouseUp', x: to.x, y: to.y, button: 'left', clickCount: 1 })
  await delay(500)
  const ghostAfter = await ui.executeJavaScript(`!!document.querySelector('.tab-drag-ghost')`)
  const indAfter = await ui.executeJavaScript(`!!document.querySelector('.tab-drop-indicator')`)
  const orderEnd = await ui.executeJavaScript(`Array.from(document.querySelectorAll('.tab-list .tab')).map(t => t.dataset.id)`)
  console.log('GHOST_TEST:', JSON.stringify({ midGhost, ghostAfter, indAfter, reordered: JSON.stringify(orderMid) !== JSON.stringify(orderEnd), orderEnd }))
  const ok = midGhost && midGhost.ghost && !ghostAfter && !indAfter
  console.log('RESULT:', ok ? 'GHOST_OK' : 'GHOST_FAIL')
  win.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
