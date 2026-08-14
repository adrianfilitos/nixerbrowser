const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const http = require('http')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-addr-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  const waitTab = () => ui.executeJavaScript(`(async () => { for (let i = 0; i < 60; i++) { const t = document.querySelector('.tab'); if (t && t.dataset.id) return t.dataset.id; await new Promise(r => setTimeout(r, 200)) } return null })()`)
  const tabId = await waitTab()
  if (!tabId) { console.log('NO_TAB'); app.exit(2); return }
  await delay(1000)
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<html><body><h1>REALPAGE</h1></body></html>') })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  await ui.executeJavaScript(`window.api.tabLoad('${tabId}', 'http://127.0.0.1:${port}/')`)
  await delay(2500)

  const typeAndClose = async (text) => {
    await ui.executeJavaScript(`(() => { const i = document.querySelector('.address-bar input'); if (!i) return 'NO_INPUT'; i.focus(); i.dispatchEvent(new Event('focusin', { bubbles: true })); const setVal = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setVal.call(i, '${text}'); i.dispatchEvent(new Event('input', { bubbles: true })); return 'OK' })()`)
    await delay(800)
    const dd = await ui.executeJavaScript(`!!document.querySelector('.autocomplete')`)
    const urlDuring = await ui.executeJavaScript(`window.api.tabGetUrl('${tabId}')`)
    await ui.executeJavaScript(`(async () => { const i = document.querySelector('.address-bar input'); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); i.blur(); await new Promise(r => setTimeout(r, 50)) })()`)
    await delay(600)
    const urlAfter = await ui.executeJavaScript(`window.api.tabGetUrl('${tabId}')`)
    const tabs = await ui.executeJavaScript(`document.querySelectorAll('.tab').length`)
    return { dd, urlDuring: urlDuring.includes('127.0.0.1') ? 'LOCAL' : urlDuring, urlAfter: urlAfter.includes('127.0.0.1') ? 'LOCAL' : urlAfter, tabs }
  }
  const r1 = await typeAndClose('ejemplo')
  const r2 = await typeAndClose('ajust')
  console.log('ADDR:', JSON.stringify({ r1, r2 }))
  server.close()
  win.close()
  setTimeout(() => app.exit(0), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
