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
  const rects = await ui.executeJavaScript(`Array.from(document.querySelectorAll('.tab')).slice(0,2).map(t => { const r = t.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), left: r.left, width: r.width } })`)
  const to = rects[1]
  const dropX = Math.round(to.left + to.width * 0.75)
  const dropY = to.y

  // drag nativo HTML5: dragstart -> dragover -> drop -> dragend (eventos DragEvent)
  const dragRes = await ui.executeJavaScript(`(async () => {
    const tabs = Array.from(document.querySelectorAll('.tab'))
    const list = document.querySelector('.tab-list')
    const first = tabs[0]
    const dt = new DataTransfer()
    first.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
    await new Promise((r) => setTimeout(r, 80))
    const dragging = !!document.querySelector('.tab.dragging')
    list.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: ${dropX}, clientY: ${dropY}, dataTransfer: dt }))
    const ind = document.querySelector('.tab-drop-indicator')
    const indVisible = ind ? ind.style.opacity : 'NONE'
    list.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: ${dropX}, clientY: ${dropY}, dataTransfer: dt }))
    first.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, clientX: ${dropX}, clientY: ${dropY}, dataTransfer: dt }))
    return { dragging, indVisible }
  })()`)
  await delay(800)

  const after = await wto(order(), 4000, 'after')
  const draggingAfter = await ui.executeJavaScript(`!!document.querySelector('.tab.dragging')`)

  console.log('REORDER:', JSON.stringify({ before, after, dropX, dropY, dragRes, draggingAfter }))
  const ok = JSON.stringify(before) !== JSON.stringify(after) && dragRes.dragging === true && draggingAfter === false
  console.log('RESULT:', ok ? 'REORDER_OK' : 'REORDER_FAIL')
  win.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
