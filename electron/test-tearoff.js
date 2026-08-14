const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-tearoff-profile')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const wto = (p, ms, tag) => Promise.race([p, new Promise((r) => setTimeout(() => r('TIMEOUT:' + tag), ms))])

app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 20 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  await delay(1500)
  await ui.executeJavaScript(`window.api.openNewTab('https://example.com'); true`)
  await delay(3000)

  const pt = await ui.executeJavaScript(`(() => {
    const tab = Array.from(document.querySelectorAll('.tab')).find(t => (t.title || '').indexOf('Example') !== -1)
    if (!tab) return null
    const r = tab.getBoundingClientRect()
    const s = document.querySelector('.tab-strip').getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), bottom: Math.round(s.bottom) }
  })()`)
  if (!pt) { console.log('NO_TAB'); app.exit(2); return }

  const count0 = await ui.executeJavaScript(`document.querySelectorAll('.tab').length`)
  // drag nativo HTML5: soltar fuera de la barra -> tear-off a ventana nueva
  await ui.executeJavaScript(`(() => {
    const tab = Array.from(document.querySelectorAll('.tab')).find(t => (t.title || '').indexOf('Example') !== -1)
    const dt = new DataTransfer()
    tab.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }))
    tab.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, clientX: ${pt.x}, clientY: ${pt.bottom + 100}, screenX: 40, screenY: 40, dataTransfer: dt }))
    return true
  })()`)
  await delay(3000)

  const wins = BrowserWindow.getAllWindows()
  const count1 = await ui.executeJavaScript(`document.querySelectorAll('.tab').length`)
  const newWin = wins.find((w) => w !== win)
  let newUrls = 'NO_WIN'
  if (newWin) {
    for (let i = 0; i < 40; i++) {
      newUrls = await newWin.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.tab-title')).map(t => t.textContent)`).catch(() => 'ERR')
      if (Array.isArray(newUrls) && newUrls.some((t) => String(t).indexOf('Example') !== -1)) break
      await delay(250)
    }
  }
  console.log('TEAROFF:', JSON.stringify({ pt, count0, count1, numWindows: wins.length, newUrls }))
  const ok = wins.length >= 2 && Array.isArray(newUrls) && newUrls.some((t) => String(t).indexOf('Example') !== -1)
  console.log('RESULT:', ok ? 'TEAROFF_OK' : 'TEAROFF_FAIL')
  wins.forEach((w) => w.close())
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
