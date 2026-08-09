const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-dock-profile')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })

require('./main')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const wto = (p, ms, tag) => Promise.race([p, new Promise((r) => setTimeout(() => r('TIMEOUT:' + tag), ms))])

app.whenReady().then(async () => {
  let winA = null
  for (let i = 0; i < 20 && !winA; i++) {
    const ws = BrowserWindow.getAllWindows()
    if (ws.length) winA = ws[0]
    else await delay(500)
  }
  const uia = winA.webContents
  await delay(1500)

  // la pestaña A informa de que se arrastra
  const idA = await uia.executeJavaScript(`window.api.windowInfo()`)
  await uia.executeJavaScript(`window.api.dragStart({ tabId: 999, url: 'https://example.com/dock', title: 'Dock' }); true`)

  // abrir ventana B
  await uia.executeJavaScript(`window.api.createWindow(false); true`)
  await delay(3000)
  let winB = null
  for (const w of BrowserWindow.getAllWindows()) {
    const info = await w.webContents.executeJavaScript('window.api.windowInfo()').catch(() => null)
    if (info && info.id !== idA.id) { winB = w; break }
  }

  // verificar dragState expuesto
  const st = await wto(uia.executeJavaScript(`window.api.getDragState()`), 3000, 'st')
  const hasState = st && st.winId === idA.id

  // B hace dock del tab arrastrado
  const docked = await wto(winB.webContents.executeJavaScript(`window.api.dockDragged()`), 3000, 'dock')

  // comprobar que B abrió la pestaña con la URL
  await delay(2500)
  const urlsB = await wto(winB.webContents.executeJavaScript(`Array.from(document.querySelectorAll('.tab')).map(t => t.title) || []`), 6000, 'tabs')

  console.log('DOCK:', JSON.stringify({ idA: idA.id, idB: winB ? (await winB.webContents.executeJavaScript('window.api.windowInfo()').catch(() => null)) : null, hasState, docked, urlsB }))
  const ok = hasState === true && docked === true && Array.isArray(urlsB) && urlsB.some((t) => String(t).indexOf('Example') !== -1)
  console.log('RESULT:', ok ? 'DOCK_OK' : 'DOCK_FAIL')
  winA.close()
  if (winB) winB.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
