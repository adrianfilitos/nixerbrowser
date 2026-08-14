const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-cert-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const tabs = require('./tabs')
const ctx = require('./ctx')
const popups = require('./popups')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const withTimeout = (p, ms, tag) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout:' + tag)), ms))])
app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  const wctx = ctx.windows.get(win)
  const results = {}
  const waitTab = () => ui.executeJavaScript(`(async () => { for (let i = 0; i < 60; i++) { const t = document.querySelector('.tab'); if (t && t.dataset.id) return t.dataset.id; await new Promise(r => setTimeout(r, 200)) } return null })()`)
  const tabId = await waitTab()
  if (!tabId) { console.log('CERT: NO_TAB'); app.exit(2); return }
  await delay(1200)
  const tab = tabs.getTab(wctx, tabId)
  const failed = []
  if (tab) tab.wc.on('did-fail-load', (_e, code, desc, url) => failed.push({ code, desc, url }))

  const badUrl = 'https://self-signed.badssl.com/'
  await ui.executeJavaScript(`window.api.tabLoad('${tabId}', '${badUrl}')`)
  await delay(5000)
  results.didFail = failed.map((f) => f.code + ':' + f.desc).slice(0, 3)
  results.blocked = failed.some((f) => f.code < 0 && f.code <= -200)

  results.badStatus = await ui.executeJavaScript(`window.api.certStatus('https://self-signed.badssl.com')`).catch((e) => 'ERR:' + e.message)
  results.goodStatus = await ui.executeJavaScript(`window.api.certStatus('https://x.com')`).catch((e) => 'ERR:' + e.message)

  const t2 = tabs.getTab(wctx, tabId)
  results.tabUrl = t2 ? t2.wc.getURL() : 'NOTAB'
  if (t2 && t2.wc.getURL().startsWith('https://self-signed.badssl.com')) {
    await ui.executeJavaScript(`document.querySelector('.sec-chip').click(); true`).catch(() => {})
    for (let i = 0; i < 20; i++) { if (popups.windowFor('siteinfo-popup')) break; await delay(200) }
    const pw = popups.windowFor('siteinfo-popup') ? popups.windowFor('siteinfo-popup').webContents : null
    results.popupText = pw ? await withTimeout(pw.executeJavaScript(`document.body.innerText.slice(0, 120)`), 4000, 'txt').catch((e) => 'ERR:' + e.message) : 'NOPOPUP'
  }

  console.log('CERT:', JSON.stringify(results))
  const ok = results.blocked && results.badStatus && results.badStatus.secure === false && results.badStatus.error !== null && results.goodStatus && results.goodStatus.secure === true
  console.log('RESULT:', ok ? 'CERT_OK' : 'CERT_FAIL')
  win.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 120000)
