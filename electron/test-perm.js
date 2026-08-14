const { app, BrowserWindow, webContents } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const http = require('http')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-perm-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const popups = require('./popups')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  const permReqs = []
  ui.on('permission-request', (_e, d) => permReqs.push(d))
  console.log('WINDOWS:', BrowserWindow.getAllWindows().length)
  const waitTab = () => ui.executeJavaScript(`(async () => { for (let i = 0; i < 60; i++) { const t = document.querySelector('.tab'); if (t && t.dataset.id) return t.dataset.id; await new Promise(r => setTimeout(r, 200)) } return null })()`)
  const tabId = await waitTab()
  if (!tabId) { console.log('NO_TAB'); app.exit(2); return }
  await delay(1000)
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<html><body><script>let n=0; const tryGeo=()=>{ if(n++>10) return; navigator.geolocation.getCurrentPosition(function(){}, function(){ setTimeout(tryGeo, 600) }) }; setTimeout(tryGeo, 300)</script></body></html>') })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  await ui.executeJavaScript(`window.api.tabLoad('${tabId}', 'http://127.0.0.1:${port}/')`)
  await delay(4000)
  // El permiso ahora es un popup NATIVO (WebContentsView) anclado al botón.
  const modal = await (async () => {
    for (let i = 0; i < 30; i++) {
      const pc = popups.count()
      const dbg = popups.debugBounds()
      if (pc === 1 && dbg[0] && dbg[0].key === 'permission-popup') return true
      await delay(200)
    }
    return false
  })()
  let granted = false
  if (modal) {
    const pw = webContents.getAllWebContents().find((w) => w !== ui && w.getURL().includes('popup.html'))
    const btn = await (pw ? pw.executeJavaScript(`(async () => {
      for (let i = 0; i < 30; i++) {
        const b = document.querySelector('[data-m="allow"]')
        if (b) {
          const cb = document.querySelector('#rem')
          if (cb && !cb.checked) cb.click()
          b.click()
          return 'CLICKED'
        }
        await new Promise(r => setTimeout(r, 100))
      }
      return 'NO_BTN'
    })()`).catch(() => 'JS_ERR') : 'NO_POPUP')
    await delay(800)
    granted = btn === 'CLICKED'
    const perms = await ui.executeJavaScript(`window.api.permissionsList()`).catch(() => [])
    console.log('PERMS_LIST:', JSON.stringify(perms))
    const found = perms.some((s) => s.origin === 'http://127.0.0.1:' + port && s.perms.some((p) => p.permission === 'geolocation' && p.state === 'allow'))
    granted = granted && found
  }
  console.log('MODAL:', modal)
  console.log('PERM_REQS:', JSON.stringify(permReqs))
  server.close()
  console.log('RESULT:', granted ? 'PERM_OK' : 'PERM_FAIL')
  win.close()
  setTimeout(() => app.exit(granted ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
