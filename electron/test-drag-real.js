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
  const pos0 = win.getPosition()
  const rects = await ui.executeJavaScript(`Array.from(document.querySelectorAll('.tab')).slice(0,2).map(t => { const r = t.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), left: r.left, width: r.width } })`)
  const to = rects[1]
  const dropX = Math.round(to.left + to.width * 0.75)
  const dropY = to.y

  // drag nativo HTML5: reorder dentro de la ventana. No debe mover la ventana ni crear pestañas.
  await ui.executeJavaScript(`(() => {
    const tabs = Array.from(document.querySelectorAll('.tab'))
    const list = document.querySelector('.tab-list')
    const dt = new DataTransfer()
    tabs[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
    list.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: ${dropX}, clientY: ${dropY}, dataTransfer: dt }))
    list.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: ${dropX}, clientY: ${dropY}, dataTransfer: dt }))
    tabs[0].dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, clientX: ${dropX}, clientY: ${dropY}, dataTransfer: dt }))
    return true
  })()`)
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
