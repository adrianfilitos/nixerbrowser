const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-roundtrip-profile')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const wto = (p, ms, tag) => Promise.race([p, new Promise((r) => setTimeout(() => r('TIMEOUT:' + tag), ms))])

async function tabs(wc) {
  return wc.executeJavaScript(`Array.from(document.querySelectorAll('.tab-title')).map(t => t.textContent)`).catch(() => 'ERR')
}
function hasExample(list) { return Array.isArray(list) && list.some((t) => String(t).indexOf('Example') !== -1) }

app.whenReady().then(async () => {
  let winA = null
  for (let i = 0; i < 20 && !winA; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) winA = ws[0]; else await delay(400) }
  const uia = winA.webContents
  await delay(1500)
  await uia.executeJavaScript(`window.api.openNewTab('https://example.com'); true`)
  await delay(3000)

  // 1) Tear-off: arrastrar hacia abajo
  const pt = await uia.executeJavaScript(`(() => {
    const tab = Array.from(document.querySelectorAll('.tab')).find(t => (t.title || '').indexOf('Example') !== -1)
    if (!tab) return null
    const r = tab.getBoundingClientRect()
    const s = document.querySelector('.tab-strip').getBoundingClientRect()
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), bottom: Math.round(s.bottom) }
  })()`)
  if (!pt) { console.log('NO_TAB'); app.exit(2); return }
  const aBefore = await tabs(uia)
  uia.sendInputEvent({ type: 'mouseDown', x: pt.x, y: pt.y, button: 'left', clickCount: 1 })
  for (let i = 1; i <= 20; i++) {
    uia.sendInputEvent({ type: 'mouseMove', x: pt.x, y: Math.round(pt.y + ((pt.bottom + 80) - pt.y) * (i / 20)), button: 'left', buttons: 1, movementX: 0, movementY: 3 })
    await delay(25)
  }
  await delay(3000)

  const winB = BrowserWindow.getAllWindows().find((w) => w !== winA)
  if (!winB) { console.log('NO_WINB'); app.exit(2); return }
  const uib = winB.webContents
  const bAfterTear = await tabs(uib)
  const aAfterTear = await tabs(uia)

  // 2) Volver a acoplar: desde B arrastrar la pestaña a la barra de A
  const idB = await uib.executeJavaScript(`(() => {
    const tab = Array.from(document.querySelectorAll('.tab')).find(t => (t.title || '').indexOf('Example') !== -1)
    return tab ? tab.dataset.id : null
  })()`)
  const urlB = 'https://example.com'
  const ptA = await uia.executeJavaScript(`(() => { const r = document.querySelector('.tab').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } })()`)
  const cbA = winA.getContentBounds()
  const sx = cbA.x + ptA.x
  const sy = cbA.y + ptA.y

  await uib.executeJavaScript(`window.api.dragStart({ tabId: ${JSON.stringify(idB)}, url: '${urlB}', title: 'Example' }); true`)
  await uib.executeJavaScript(`window.api.dragMove(${sx}, ${sy}); true`)
  await delay(600)
  await uib.executeJavaScript(`window.api.dragDrop(${sx}, ${sy}); true`)
  await delay(3000)

  const aFinal = await tabs(uia)
  const bFinal = await tabs(uib)
  console.log('ROUNDTRIP:', JSON.stringify({ aBefore, bAfterTear, aAfterTear, aFinal, bFinal }))
  const ok = hasExample(aFinal) && !hasExample(bFinal) && !hasExample(aAfterTear)
  console.log('RESULT:', ok ? 'ROUNDTRIP_OK' : 'ROUNDTRIP_FAIL')
  winA.close()
  if (winB && !winB.isDestroyed()) winB.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 120000)
