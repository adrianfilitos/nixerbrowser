const { app, BrowserWindow, webContents } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const http = require('http')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-popup-test')
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
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<html><body style="background:#ffffff"><h1>PAGE</h1></body></html>') })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  await ui.executeJavaScript(`window.api.tabLoad('${tabId}', 'http://127.0.0.1:${port}/')`)
  await delay(2500)
  const actions = []
  await ui.executeJavaScript(`document.querySelector('.menu-btn').click(); true`)
  await delay(1500)
  const popupView = webContents.getAllWebContents().find((w) => w !== ui && w.getURL().includes('popup.html'))
  const popupState = popupView ? await popupView.executeJavaScript(`({ body: document.body.textContent.slice(0, 80), hasItems: !!document.querySelector('.item') })`).catch(() => 'ERR') : 'NO_POPUP'
  console.log('POPUP:', JSON.stringify({ popupState, hasPopupWc: !!popupView }))
  const settingsClicked = popupView ? await popupView.executeJavaScript(`(() => { const el = document.querySelector('.item[data-key="settings"]'); if (!el) return 'NO_ITEM'; el.click(); return 'CLICKED' })()`) : 'NO_POPUP'
  await delay(1500)
  const tabs = await ui.executeJavaScript(`Array.from(document.querySelectorAll('.tab')).map(t => ({ url: '', title: t.querySelector('.tab-title').textContent }))`)
  const activeUrl = await ui.executeJavaScript(`(async () => { const a = document.querySelector('.tab.active'); if (!a) return 'NO_ACTIVE'; return window.api.tabGetUrl(a.dataset.id) })()`)
  console.log('AFTER_CLICK:', JSON.stringify({ settingsClicked, activeUrl, tabs }))
  server.close()
  win.close()
  console.log('RESULT:', popupState !== 'NO_POPUP' && activeUrl && activeUrl.startsWith('nixer://settings') ? 'POPUP_OK' : 'POPUP_FAIL')
  setTimeout(() => app.exit(0), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
