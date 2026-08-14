const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const http = require('http')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-fixes-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const store = require('./store')

app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  await delay(1500)

  const results = {}

  // 1) window.api.groups y window.api.workspaces expuestos en preload del main UI
  const exposed = await ui.executeJavaScript(`({ groups: typeof window.api.groups, workspaces: typeof window.api.workspaces, permSet: typeof window.api.permissionsSet })`)
  results.groupsExposed = exposed.groups === 'object'
  results.workspacesExposed = exposed.workspaces === 'object'

  // 2) Roundtrip de grupos (persistencia)
  await ui.executeJavaScript(`window.api.groups.set({ 'g1': { id: 'g1', label: 'Grupo A', color: '#f00' } }); true`)
  const groups = await ui.executeJavaScript(`window.api.groups.get()`)
  results.groupsRoundtrip = !!(groups && groups.g1 && groups.g1.label === 'Grupo A')

  // 3) Roundtrip de workspaces
  await ui.executeJavaScript(`window.api.workspaces.save('Ws1', [{ url: 'https://example.com' }]); true`)
  const wsList = await ui.executeJavaScript(`window.api.workspaces.list()`)
  results.workspacesRoundtrip = Array.isArray(wsList) && wsList.some((w) => w.name === 'Ws1')

  // 4) shields:get expone blockTrackers (switch de Rastreadores del backend)
  const shields = await ui.executeJavaScript(`window.api.shieldsGet('https://example.com')`)
  results.blockTrackersInShields = shields && 'blockTrackers' in shields

  // 5) El popup nativo de permisos tiene el botón "Permitir una vez"
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<html><body><script>let n=0; const tryGeo=()=>{ if(n++>10) return; navigator.geolocation.getCurrentPosition(function(){}, function(){ setTimeout(tryGeo, 600) }) }; setTimeout(tryGeo, 300)</script></body></html>') })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const tabId = await ui.executeJavaScript(`(async () => { for (let i = 0; i < 60; i++) { const t = document.querySelector('.tab'); if (t && t.dataset.id) return t.dataset.id; await new Promise(r => setTimeout(r, 200)) } return null })()`)
  await ui.executeJavaScript(`window.api.tabLoad('${tabId}', 'http://127.0.0.1:${port}/')`)
  await delay(4000)
  results.onceBtn = await (async () => {
    for (let i = 0; i < 30; i++) {
      if (require('./popups').count() === 1) {
        const pw = require('electron').webContents.getAllWebContents().find((w) => w !== ui && w.getURL().includes('popup.html'))
        if (pw) {
          const has = await pw.executeJavaScript(`(async () => { for (let j = 0; j < 20; j++) { if (document.querySelector('[data-m="once"]')) return true; await new Promise(r => setTimeout(r, 100)) } return false })()`).catch(() => false)
          if (has) return true
        }
      }
      await new Promise((r) => setTimeout(r, 200))
    }
    return false
  })()
  server.close()

  console.log('FIXES:', JSON.stringify(results))
  const ok = results.groupsExposed && results.workspacesExposed && results.groupsRoundtrip && results.workspacesRoundtrip && results.blockTrackersInShields && results.onceBtn === true
  console.log('RESULT:', ok ? 'FIXES_OK' : 'FIXES_FAIL')
  win.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
