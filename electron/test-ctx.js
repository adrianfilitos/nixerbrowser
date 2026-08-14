const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-ctx-test')
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
  const tabCount = () => ui.executeJavaScript(`document.querySelectorAll('.tab').length`)
  const clickItem = async (key, itemKey) => {
    const pw = popups.windowFor(key) ? popups.windowFor(key).webContents : null
    if (!pw) return 'NOPW'
    return pw.executeJavaScript(`(async () => { for (let i = 0; i < 30; i++) { const it = document.querySelector('[data-key="${itemKey}"]'); if (it) { it.click(); return true } await new Promise(r => setTimeout(r, 100)) } return false })()`).catch(() => false)
  }
  const before = await tabCount()

  // 1) Menú contextual de pestaña -> nueva pestaña (ventana nativa)
  await ui.executeJavaScript(`(async () => { for (let i = 0; i < 40; i++) { const t = document.querySelector('.tab'); if (t) { t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 30 })); return true } await new Promise(r => setTimeout(r, 150)) } return false })()`)
  await delay(800)
  results.ctxOpen = popups.debugBounds().some((p) => p.key === 'tab-ctx')
  results.ctxClicked = await clickItem('tab-ctx', 'new')
  await delay(1200)
  results.ctxTab = (await tabCount()) === before + 1

  // 2) Manejar pestañas -> nueva pestaña (ventana nativa)
  await ui.executeJavaScript(`(async () => { for (let i = 0; i < 40; i++) { const b = document.querySelector('.tab-manage'); if (b) { b.click(); return true } await new Promise(r => setTimeout(r, 150)) } return false })()`)
  await delay(900)
  results.manOpen = popups.debugBounds().some((p) => p.key === 'tab-manage')
  results.manRenderErr = popups.windowFor('tab-manage') ? await popups.windowFor('tab-manage').webContents.executeJavaScript(`window.__renderErr || 'NONE'`).catch(() => 'ERR') : 'NOPW'
  results.manClicked = await clickItem('tab-manage', 'new')
  await delay(1200)
  results.manTab = (await tabCount()) === before + 2

  results.log = await ui.executeJavaScript(`JSON.stringify(window.__log || [])`)

  console.log('CTX:', JSON.stringify(results))
  const ok = results.ctxOpen && results.ctxClicked && results.ctxTab && results.manOpen && results.manClicked && results.manTab
  console.log('RESULT:', ok ? 'CTX_OK' : 'CTX_FAIL')
  win.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
