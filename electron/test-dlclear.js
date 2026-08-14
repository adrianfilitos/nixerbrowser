const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-dlclear-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const store = require('./store')
const tabs = require('./tabs')
const ctx = require('./ctx')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  const wctx = ctx.windows.get(win)
  await delay(1000)

  const results = {}
  store.upsertDownload({ id: 'c1', name: 'completa.pdf', url: 'x', path: 'x', received: 100, total: 100, state: 'completed', ts: Date.now() })
  store.upsertDownload({ id: 'c2', name: 'otra.png', url: 'x', path: 'x', received: 50, total: 100, state: 'completed', ts: Date.now() })
  store.upsertDownload({ id: 'p1', name: 'en-curso.zip', url: 'x', path: 'x', received: 10, total: 100, state: 'in-progress', ts: Date.now() })

  const waitTab = () => ui.executeJavaScript(`(async () => { for (let i = 0; i < 60; i++) { const t = document.querySelector('.tab'); if (t && t.dataset.id) return t.dataset.id; await new Promise(r => setTimeout(r, 200)) } return null })()`)
  const tabId = await waitTab()
  await delay(1000)
  await ui.executeJavaScript(`window.api.tabLoad('${tabId}', 'nixer://downloads')`)
  await delay(3500)
  const tab = tabs.getTab(wctx, tabId)
  const twc = tab ? tab.wc : null
  results.tabUrl = twc ? twc.getURL() : 'NOTAB'
  results.tabTitle = twc ? twc.getTitle() : ''
  if (twc) {
    results.listLen = await twc.executeJavaScript(`browserAPI.downloads.list().then((l) => l.length).catch((e) => 'ERR:' + e.message)`).catch((e) => 'ERR:' + e.message)
    results.rowsBefore = await twc.executeJavaScript(`document.querySelectorAll('.row').length`).catch((e) => 'ERR:' + e.message)
    results.emptyBefore = await twc.executeJavaScript(`!!document.querySelector('.empty')`).catch((e) => 'ERR:' + e.message)
    await twc.executeJavaScript(`(document.getElementById('clear') || {}).click ? (document.getElementById('clear').click(), true) : false`).catch(() => {})
    await delay(1200)
    results.rowsAfter = await twc.executeJavaScript(`document.querySelectorAll('.row').length`).catch((e) => 'ERR:' + e.message)
    results.storeAfter = store.downloads().map((d) => d.id).join(',')
  }

  console.log('DLCLEAR:', JSON.stringify(results))
  win.close()
  setTimeout(() => app.exit(0), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
