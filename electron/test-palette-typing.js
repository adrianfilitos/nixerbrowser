const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-palette-typing-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const popups = require('./popups')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const withTimeout = (p, ms, tag) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout:' + tag)), ms))])
app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  await delay(1500)
  const results = {}
  ui.send('ui-action', 'open-palette')
  await delay(1000)
  console.log('PAL_DEBUG1:', JSON.stringify(popups.debugBounds()))
  const opened = await (async () => {
    for (let i = 0; i < 30; i++) { if (popups.windowFor('palette-popup')) return true; await delay(200) }
    return false
  })()
  results.opened = opened
  if (!opened) {
    const menuBtn = await ui.executeJavaScript(`!!document.querySelector('.menu-btn')`)
    console.log('PAL_DEBUG2: hasMenuBtn', menuBtn)
    await ui.executeJavaScript(`document.querySelector('.menu-btn').click(); true`).catch(() => {})
    await delay(900)
    const pw = popups.windowFor('toolbar-menu') ? popups.windowFor('toolbar-menu').webContents : null
    if (pw) {
      await withTimeout(pw.executeJavaScript(`(async () => { for (let i = 0; i < 30; i++) { const it = document.querySelector('[data-key="palette"]'); if (it) { it.click(); return true } await new Promise(r => setTimeout(r, 100)) } return false })()`), 6000, 'menu-palette').catch(() => {})
    }
    const reopened = await (async () => {
      for (let i = 0; i < 30; i++) { if (popups.windowFor('palette-popup')) return true; await delay(200) }
      return false
    })()
    results.openedViaMenu = reopened
    if (!reopened) console.log('PAL_DEBUG3:', JSON.stringify(popups.debugBounds()))
  }
  if (opened || results.openedViaMenu) {
    const pw = popups.windowFor('palette-popup').webContents
    await delay(500)
    const before = await withTimeout(pw.executeJavaScript(`document.querySelector('#q') ? document.querySelector('#q').value : 'NOINPUT'`), 4000, 'before').catch((e) => 'ERR:' + e.message)
    results.before = before
    const typed = await withTimeout(pw.executeJavaScript(`(() => { const q = document.querySelector('#q'); if (!q) return false; q.value = 'acerca'; q.dispatchEvent(new Event('input', { bubbles: true })); return true })()`), 4000, 'type').catch((e) => 'ERR:' + e.message)
    results.typed = typed === true
    await delay(1200)
    results.staysOpen = !!popups.windowFor('palette-popup')
    if (results.staysOpen) {
      results.after = await withTimeout(pw.executeJavaScript(`document.querySelector('#q') ? document.querySelector('#q').value : 'NOINPUT'`), 4000, 'after').catch((e) => 'ERR:' + e.message)
    }
    const closes = await withTimeout(pw.executeJavaScript(`(() => { const q = document.querySelector('#q'); if (!q) return false; q.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true })()`), 4000, 'esc').catch((e) => 'ERR:' + e.message)
    results.escFired = closes === true
    await delay(800)
    results.closedOnEsc = !popups.windowFor('palette-popup')
  }
  console.log('PAL:', JSON.stringify(results))
  const ok = (results.opened || results.openedViaMenu) && results.typed && results.staysOpen && results.after === 'acerca' && results.closedOnEsc
  console.log('RESULT:', ok ? 'PAL_OK' : 'PAL_FAIL')
  win.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
