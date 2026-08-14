const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-profile-popup-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const popups = require('./popups')
const profiles = require('./profiles')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const wto = (p, ms, tag) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout:' + tag)), ms))])

function realClick(ui) {
  return ui.executeJavaScript(`(() => { const b = document.querySelector('.profile-avatar'); const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } })()`).then((p) => {
    ui.sendInputEvent({ type: 'mouseDown', x: p.x, y: p.y, button: 'left', clickCount: 1 })
    ui.sendInputEvent({ type: 'mouseUp', x: p.x, y: p.y, button: 'left', clickCount: 1 })
  })
}
async function waitPopup(key) {
  for (let i = 0; i < 30; i++) { const w = popups.windowFor(key); if (w) return w.webContents; await delay(200) }
  return null
}

app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws.find((w) => w.webContents.getURL().includes('index.html')) || ws[0]; else await delay(400) }
  const ui = win.webContents
  await delay(1800)
  const results = {}
  await ui.executeJavaScript(`(async () => { for (let i = 0; i < 40; i++) { const t = document.querySelector('.profile-avatar'); if (t && t.getAttribute('title')) return true; await new Promise(r => setTimeout(r, 200)) } return false })()`).catch(() => {})

  // 1) CLIC REAL -> abre la tarjeta (detecta zona drag).
  await realClick(ui)
  const pw = await waitPopup('profile-popup')
  results.opened = !!pw
  if (pw) {
    results.name = await wto(pw.executeJavaScript(`(document.querySelector('.profile-name') || {}).textContent || ''`), 4000, 'name')
    results.badge = await wto(pw.executeJavaScript(`(document.querySelector('.profile-badge') || {}).textContent || ''`), 4000, 'badge')
    results.rows = await wto(pw.executeJavaScript(`document.querySelectorAll('.profile-row').length`), 4000, 'rows')
    results.acts = await wto(pw.executeJavaScript(`Array.from(document.querySelectorAll('.profile-act')).map(a => a.textContent.trim()).join('|')`), 4000, 'acts')
    // 2) "Menú del navegador" abre el menú de la barra.
    const clicked = await wto(pw.executeJavaScript(`(() => { const m = Array.from(document.querySelectorAll('.profile-act')).find(a => a.textContent.includes('Menú')); if (m) m.click(); return !!m })()`), 4000, 'menu')
    results.menuClicked = clicked
    await delay(1200)
    results.menuOpened = !!popups.windowFor('toolbar-menu')
  }

  // 3) Segundo perfil + cambio vía fila (la tarjeta quedó cerrada tras el menú).
  const bob = profiles.createLocal('Bob', '#3da26e')
  await delay(800)
  await realClick(ui)
  const pw2 = await waitPopup('profile-popup')
  results.rows2 = pw2 ? await wto(pw2.executeJavaScript(`document.querySelectorAll('.profile-row').length`), 4000, 'rows2') : 0
  if (pw2) {
    const defaultId = profiles.list().find((p) => p.name === 'Por defecto').id
    await wto(pw2.executeJavaScript(`(() => { const r = document.querySelector('[data-switch="${defaultId}"]'); if (r) r.click(); return !!r })()`), 4000, 'switch')
    await delay(1200)
  }
  results.switchedViaPopup = profiles.current().name === 'Por defecto'

  console.log('PFP:', JSON.stringify(results))
  const ok = results.opened && results.name === 'Por defecto' && results.badge === 'Local' && results.rows >= 1 && results.acts.length > 0 && results.menuClicked && results.menuOpened && results.rows2 >= 2 && results.switchedViaPopup
  console.log('RESULT:', ok ? 'PFP_OK' : 'PFP_FAIL')
  app.exit(ok ? 0 : 1)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
