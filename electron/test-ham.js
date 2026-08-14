const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-ham-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const popups = require('./popups')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  await delay(1500)
  const waitTab = () => ui.executeJavaScript(`(async () => { for (let i = 0; i < 60; i++) { const t = document.querySelector('.tab'); if (t && t.dataset.id) return t.dataset.id; await new Promise(r => setTimeout(r, 200)) } return null })()`)
  await waitTab()
  await delay(800)
  await ui.executeJavaScript(`window.__log = []; window.api.onPopupAction(({key, data}) => window.__log.push(key+':'+data)); true`)

  const results = {}
  const before = await ui.executeJavaScript(`document.querySelectorAll('.tab').length`)

  await ui.executeJavaScript(`document.querySelector('.profile-avatar').click(); true`)
  const openMenu = await (async () => {
    for (let i = 0; i < 30; i++) {
      const pc = popups.windowFor('profile-popup')
      if (pc) {
        const ok = await pc.webContents.executeJavaScript(`(() => { const m = Array.from(document.querySelectorAll('.profile-act')).find(a => a.textContent.includes('Menú')); if (m) { m.click(); return true } return false })()`).catch(() => false)
        if (ok) return true
      }
      await delay(200)
    }
    return false
  })()
  await delay(900)
  results.open = popups.debugBounds().some((p) => p.key === 'toolbar-menu')
  const pw = popups.windowFor('toolbar-menu') ? popups.windowFor('toolbar-menu').webContents : null
  results.pw = !!pw
  if (pw) {
    results.labels = await pw.executeJavaScript(`Array.from(document.querySelectorAll('.item')).map(el => el.dataset.key + '=' + (el.querySelector('.label') || {}).textContent).join('|')`).catch(() => 'ERR')
    const clicked = await pw.executeJavaScript(`(async () => { for (let i = 0; i < 30; i++) { const it = document.querySelector('[data-key="new-tab"]'); if (it) { it.click(); return true } await new Promise(r => setTimeout(r, 100)) } return false })()`).catch(() => false)
    results.clicked = clicked
    await delay(1200)
    results.log = await ui.executeJavaScript(`JSON.stringify(window.__log || [])`)
    results.stillOpen = !!popups.windowFor('toolbar-menu')
  }
  results.after = await ui.executeJavaScript(`document.querySelectorAll('.tab').length`)
  results.created = results.after === before + 1

  console.log('HAM:', JSON.stringify(results))
  const ok = results.open && results.pw && results.clicked && results.created
  console.log('RESULT:', ok ? 'HAM_OK' : 'HAM_FAIL')
  win.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
