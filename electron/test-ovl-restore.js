const { app, BrowserWindow, webContents } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const http = require('http')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-ovl-restore-test')
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
  const wc = webContents.getAllWebContents().find((w) => w !== ui && w.getURL().includes('127.0.0.1'))
  console.log('WC:', wc ? wc.id : 'none')
  let viewState = () => 'n/a'
  const tabs = require('./tabs')
  const ctx = require('./ctx')
  const c = ctx.ctxForWc(wc)
  viewState = () => {
    const t = tabs.getTab(c, tabId)
    if (!t) return 'no-tab'
    const b = t.view.getBounds()
    let vis = '?'
    try { vis = t.view.isVisible ? t.view.isVisible() : t.view.visible } catch { vis = 'ERR' }
    return JSON.stringify({ visible: vis, bounds: b })
  }
  console.log('BEFORE:', viewState())
  await ui.executeJavaScript(`document.querySelector('.menu-btn').click(); true`)
  await delay(500)
  console.log('MENU_OPEN:', viewState())
  await ui.executeJavaScript(`document.querySelector('.menu-btn').click(); true`)
  await delay(700)
  console.log('AFTER_CLOSE:', viewState())
  console.log('WIN_TITLE:', JSON.stringify(win.getTitle()), 'HWND:', win.getNativeWindowHandle().readInt32LE(0))
  try {
    const children = win.contentView.children
    const info = children.map((c) => {
      let type = 'unknown', id = '?'
      try { if (c.webContents) { type = c.webContents.getType(); id = c.webContents.id } } catch {}
      let b = null
      try { b = c.getBounds() } catch {}
      return { type, id, bounds: b }
    })
    console.log('CONTENTVIEW_CHILDREN:', JSON.stringify(info))
  } catch (e) { console.log('CV_ERR', e.message) }
  const img = await wc.capturePage()
  const out = path.join(os.tmpdir(), 'ovl-page-capture.png')
  fs.writeFileSync(out, img.toPNG())
  console.log('PAGE_CAPTURE_SAVED:', out)
  const PNG = require('pngjs').PNG
  const p = PNG.sync.read(fs.readFileSync(out))
  const s = (x, y) => { const i = (p.width * y + x) * 4; return p.data[i] + '/' + p.data[i + 1] + '/' + p.data[i + 2] }
  console.log('PAGE_PIXELS:', JSON.stringify({ w: img.getSize().width, h: img.getSize().height }))
  await ui.executeJavaScript(`window.api.tabLoad('${tabId}', 'data:text/html,<body style="background:#ff00ff"><h1>MAGENTA</h1></body>')`)
  await delay(2500)
  const winImg = await win.capturePage()
  const out2 = path.join(os.tmpdir(), 'ovl-win-capture.png')
  fs.writeFileSync(out2, winImg.toPNG())
  const p2 = PNG.sync.read(fs.readFileSync(out2))
  const s2 = (x, y) => { const i = (p2.width * y + x) * 4; return p2.data[i] + '/' + p2.data[i + 1] + '/' + p2.data[i + 2] }
  console.log('WIN_PIXELS:', JSON.stringify({ toolbar: s2(Math.round(p2.width / 2), 40), content: s2(Math.round(p2.width / 2), Math.round(p2.height / 2)) }))
  const { WebContentsView } = require('electron')
  const extraView = new WebContentsView({ webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } })
  const extraWc = extraView.webContents
  win.contentView.addChildView(extraView)
  extraView.setBounds({ x: 400, y: 300, width: 300, height: 200 })
  await extraWc.loadURL('data:text/html,<body style="background:#ff00ff">X</body>')
  await delay(1500)
  const winImg2 = await win.capturePage()
  const out3 = path.join(os.tmpdir(), 'ovl-win-extra.png')
  fs.writeFileSync(out3, winImg2.toPNG())
  const p3 = PNG.sync.read(fs.readFileSync(out3))
  const s3 = (x, y) => { const i = (p3.width * y + x) * 4; return p3.data[i] + '/' + p3.data[i + 1] + '/' + p3.data[i + 2] }
  console.log('EXTRA_PIXELS:', JSON.stringify({ whereExtra: s3(Math.round(550 * 1.25), Math.round(400 * 1.25)), content: s3(Math.round(p3.width / 2), Math.round(p3.height / 2)) }))
  win.show(); win.focus()
  await new Promise((r) => setTimeout(r, 60000))
  server.close()
  win.close()
  app.exit(0)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
