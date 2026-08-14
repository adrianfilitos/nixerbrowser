const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-focus-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const popups = require('./popups')
const ctx = require('./ctx')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  const wctx = ctx.windows.get(win)
  const waitTab = () => ui.executeJavaScript(`(async () => { for (let i = 0; i < 60; i++) { const t = document.querySelector('.tab'); if (t) return true; await new Promise(r => setTimeout(r, 200)) } return false })()`)
  await waitTab()
  await delay(1500)
  const results = {}
  const openKey = (key) => popups.debugBounds().some((p) => p.key === key)

  // Bug 1: abrir menú, tocar DENTRO (un separador, no-accion) -> NO debe cerrarse
  await ui.executeJavaScript(`document.querySelector('.menu-btn').click(); true`)
  await delay(900)
  results.menuOpen = openKey('toolbar-menu')
  const pw = popups.windowFor('toolbar-menu')
  if (pw) {
    const clickedSep = await pw.webContents.executeJavaScript(`(() => {
      const s = document.querySelector('.sep')
      if (!s) return false
      for (const t of ['mousedown','mouseup','click']) s.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }))
      return true
    })()`).catch(() => false)
    results.sepClicked = clickedSep
    await delay(700)
    results.staysOpenAfterInsideClick = openKey('toolbar-menu')
    // Tocar FUERA: enfocar la ventana principal (clic externo real) -> debe cerrarse
    try { win.focus() } catch (e) { results.focusErr = e.message }
    await delay(700)
    results.closedAfterOutsideClick = !openKey('toolbar-menu')
  }

  // Bug 2: taskmanager abre, cierra y REABRE
  await ui.executeJavaScript(`window.__closedLog = []; window.api.onPopupClosed((k) => window.__closedLog.push(k)); true`)
  ctx.sendUi(wctx, 'open-taskmanager')
  await (async () => { for (let i = 0; i < 25 && !openKey('taskmanager-popup'); i++) await delay(150) })()
  results.tmOpen1 = openKey('taskmanager-popup')
  await ui.executeJavaScript(`window.api.hidePopup ? (window.api.hidePopup('taskmanager-popup'), true) : true`)
  await delay(600)
  results.tmClosed = !openKey('taskmanager-popup')
  results.closedLogAfterHide = await ui.executeJavaScript(`JSON.stringify(window.__closedLog || [])`)
  ctx.sendUi(wctx, 'open-taskmanager')
  await (async () => { for (let i = 0; i < 25 && !openKey('taskmanager-popup'); i++) await delay(150) })()
  results.tmReopen = openKey('taskmanager-popup')
  results.boundsAfterReopen = popups.debugBounds()
  results.closedLogTotal = await ui.executeJavaScript(`JSON.stringify(window.__closedLog || [])`)

  // currentCtx resuelve cuando una ventana-popup tiene el foco
  await ui.executeJavaScript(`document.querySelector('.menu-btn').click(); true`)
  await delay(900)
  const mpw = popups.windowFor('toolbar-menu')
  if (mpw) { try { mpw.focus() } catch {} }
  await delay(300)
  const cur = ctx.currentCtx()
  results.ctxResolvedWithPopupFocused = !!(cur && cur.id === wctx.id)

  console.log('FOCUS:', JSON.stringify(results))
  const ok = results.menuOpen && results.sepClicked && results.staysOpenAfterInsideClick && results.closedAfterOutsideClick && results.tmOpen1 && results.tmClosed && results.tmReopen && results.ctxResolvedWithPopupFocused
  console.log('RESULT:', ok ? 'FOCUS_OK' : 'FOCUS_FAIL')
  win.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
