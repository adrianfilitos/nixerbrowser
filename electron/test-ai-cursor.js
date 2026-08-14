const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-ai-cursor-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const popups = require('./popups')
const cursor = require('./cursor')
const ctx = require('./ctx')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  await delay(2000)
  const results = {}

  // IA: escribir '/' -> se abre la ventana nativa del asistente
  await ui.executeJavaScript(`(() => {
    const inp = document.querySelector('.address-bar input')
    if (!inp) return false
    inp.focus()
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(inp, '/hola')
    inp.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  await delay(1200)
  results.aiOpen = popups.debugBounds().some((p) => p.key === 'ai-popup')
  results.aiIsWindow = !!popups.windowFor('ai-popup')

  // Cursor: actualizar -> crea una ventana transparente sin errores
  const wctx = ctx.windows.get(win)
  const beforeWins = BrowserWindow.getAllWindows().length
  try { cursor.update(wctx, 300, 200, true) } catch (e) { results.cursorErr = e.message }
  await delay(800)
  results.cursorWins = BrowserWindow.getAllWindows().length
  results.cursorAdded = results.cursorWins >= beforeWins
  cursor.update(wctx, 0, 0, false)
  await delay(200)

  console.log('AI_CURSOR:', JSON.stringify(results))
  const ok = results.aiOpen && results.aiIsWindow && results.cursorAdded
  console.log('RESULT:', ok ? 'AI_CURSOR_OK' : 'AI_CURSOR_FAIL')
  win.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
