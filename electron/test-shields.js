const { app, BrowserWindow, session } = require('electron')
const http = require('http')
const path = require('path')
const os = require('os')
const fs = require('fs')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-shields-e2e')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const adblock = require('./adblock')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 30 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const uia = win.webContents

  let wcId = null
  for (let i = 0; i < 30 && !wcId; i++) {
    wcId = await uia.executeJavaScript(`(() => { const v = document.querySelector('.page-view.active'); return v ? v.getWebContentsId() : null })()`).catch(() => null)
    if (!wcId) await delay(500)
  }

  const errors = []
  session.defaultSession.webRequest.onCompleted({ urls: ['*://*/*'] }, (d) => {})
  session.defaultSession.webRequest.onErrorOccurred({ urls: ['*://*/*'] }, (d) => errors.push({ url: d.url, err: d.error }))

  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html')
    res.end(
      '<html><body>' +
        '<img src="https://doubleclick.net/b.png">' +
        '<img src="https://googletagmanager.com/gtag/js?id=X">' +
        '<img src="https://example.com/ok.png">' +
        '</body></html>'
    )
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const pageUrl = 'http://127.0.0.1:' + port + '/'

  await uia.executeJavaScript(`(() => { const v = document.querySelector('.page-view.active'); v.loadURL(${JSON.stringify(pageUrl)}); return true })()`)
  await delay(6000)

  const blocked = errors.filter((e) => e.err && String(e.err).toUpperCase().includes('BLOCKED_BY_CLIENT')).map((e) => e.url)
  const stats = adblock.stats()

  const origin = 'http://127.0.0.1:' + port
  const shieldsForOrigin = await uia.executeJavaScript(`window.api.shieldsGet(${JSON.stringify(origin)})`).catch(() => null)
  const shieldsForFull = await uia.executeJavaScript(`window.api.shieldsGet(${JSON.stringify(pageUrl)})`).catch(() => null)

  console.log('E2E:', JSON.stringify({ blocked, total: stats.total, statsBlocked: stats.blocked[origin], shieldsForOrigin, shieldsForFull }))
  const ok = blocked.some((u) => u.includes('doubleclick')) && blocked.some((u) => u.includes('googletagmanager')) && !blocked.some((u) => u.includes('example.com/ok.png')) && stats.total > 0 && shieldsForOrigin && shieldsForOrigin.ads > 0
  console.log('RESULT:', ok ? 'SHIELDS_E2E_OK' : 'SHIELDS_E2E_FAIL')
  server.close()
  win.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
