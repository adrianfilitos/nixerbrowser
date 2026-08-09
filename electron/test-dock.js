const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-dock-profile')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })

require('./main')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const wto = (p, ms, tag) => Promise.race([p, new Promise((r) => setTimeout(() => r('TIMEOUT:' + tag), ms))])

async function js(wc, code, tag) {
  try {
    const v = await wto(wc.executeJavaScript(code), 7000, tag)
    if (typeof v === 'string' && v.indexOf('TIMEOUT:') === 0) throw new Error(v)
    console.log('STEP', tag, 'OK')
    return v
  } catch (e) {
    console.log('STEP', tag, 'ERR', e && e.message)
    throw e
  }
}

app.whenReady().then(async () => {
  let winA = null
  for (let i = 0; i < 20 && !winA; i++) {
    const ws = BrowserWindow.getAllWindows()
    if (ws.length) winA = ws[0]
    else await delay(500)
  }
  const uia = winA.webContents
  await delay(1500)

  // esperar a que exista una pestaña en A para obtener un id real
  let tabIdA = null
  for (let i = 0; i < 20 && !tabIdA; i++) {
    tabIdA = await uia.executeJavaScript(`document.querySelector('.tab') ? document.querySelector('.tab').dataset.id : null`)
    if (!tabIdA) await delay(500)
  }
  if (!tabIdA) { console.log('NO_TAB_A'); app.exit(2); return }
  console.log('STEP tabA OK')
  await js(uia, `window.api.dragStart({ tabId: ${JSON.stringify(tabIdA)}, url: 'https://example.com/dock', title: 'Dock' }); true`, 'dragStart')
  await js(uia, `window.api.createWindow(false); true`, 'createWindow')

  await delay(3000)
  let winB = null
  for (const w of BrowserWindow.getAllWindows()) {
    if (w === winA) continue
    const info = await w.webContents.executeJavaScript('window.api.windowInfo()').catch(() => null)
    if (info) { winB = w; break }
  }
  if (!winB) { console.log('NO_WINB'); app.exit(2); return }
  const uib = winB.webContents
  await delay(1000)

  const local = await js(uib, `(() => { const r = document.querySelector('.tab').getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } })()`, 'localB')
  const cb = winB.getContentBounds()
  const sx = cb.x + local.x
  const sy = cb.y + local.y

  await js(uia, `window.api.dragMove(${sx}, ${sy}); true`, 'dragMove')
  await delay(800)
  const dockCls = await js(uib, `document.querySelector('.tab-list').className`, 'dockCls')
  await js(uia, `window.api.dragDrop(${sx}, ${sy}); true`, 'dragDrop')

  await delay(2500)
  const urlsB = await js(uib, `Array.from(document.querySelectorAll('.tab-title')).map(t => t.textContent)`, 'urlsB')
  const tabsA = await js(uia, `Array.from(document.querySelectorAll('.tab')).map(t => t.dataset.id)`, 'tabsA')
  const hasState = await js(uia, `window.api.getDragState()`, 'dragState')

  console.log('DOCK:', JSON.stringify({ tabIdA, local, cb, sx, sy, dockCls, urlsB, tabsA, hasState }))
  const docked = Array.isArray(urlsB) && urlsB.some((t) => String(t).indexOf('Example') !== -1)
  const closed = Array.isArray(tabsA) && tabsA.indexOf(String(tabIdA)) === -1
  const ok = docked && closed && (hasState === null)
  console.log('RESULT:', ok ? 'DOCK_OK' : 'DOCK_FAIL')
  winA.close()
  if (winB) winB.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('TOP_ERR', e && e.message); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
