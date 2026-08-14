const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-xcom-diag')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const adblock = require('./adblock')
const tabs = require('./tabs')
const ctx = require('./ctx')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  const wctx = ctx.windows.get(win)
  const results = {}
  const waitTab = () => ui.executeJavaScript(`(async () => { for (let i = 0; i < 60; i++) { const t = document.querySelector('.tab'); if (t && t.dataset.id) return t.dataset.id; await new Promise(r => setTimeout(r, 200)) } return null })()`)
  const tabId = await waitTab()
  if (!tabId) { console.log('X: NO_TAB'); app.exit(2); return }
  await delay(1200)
  const tab = tabs.getTab(wctx, tabId)
  const errors = []
  if (tab) {
    tab.wc.on('console-message', (_e, level, message) => { if (level >= 2) errors.push(message.slice(0, 160)) })
    tab.wc.on('did-fail-load', (_e, code, desc) => errors.push('did-fail-load ' + code + ' ' + desc))
  }
  const t0 = Date.now()
  await ui.executeJavaScript(`window.api.tabLoad('${tabId}', 'https://x.com/')`)
  await delay(9000)
  results.elapsed = Date.now() - t0
  const t2 = tabs.getTab(wctx, tabId)
  results.url = t2 ? t2.wc.getURL() : 'NOTAB'
  results.title = t2 ? t2.wc.getTitle() : ''
  results.bodyLen = t2 ? await t2.wc.executeJavaScript(`document.body ? document.body.innerText.length : 0`).catch(() => 'ERR') : 0
  results.bodySnippet = t2 ? await t2.wc.executeJavaScript(`document.body ? document.body.innerText.slice(0, 200).replace(/\\n/g, ' ') : ''`).catch((e) => 'ERR:' + e.message) : ''
  results.loginVisible = t2 ? await t2.wc.executeJavaScript(`!!document.querySelector('[data-testid="loginButton"], input[name="text"], a[href="/i/flow/login"], form')`).catch(() => 'ERR') : false
  results.consoleErrors = errors.slice(0, 20)
  const blocked = adblock.recentLog()
  results.blockedCount = blocked.length
  results.blocked = blocked.slice(0, 40).map((b) => (b.url || '').replace(/^https?:\/\//, '').slice(0, 90))
  console.log('X:', JSON.stringify(results))
  win.close()
  setTimeout(() => app.exit(0), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 120000)
