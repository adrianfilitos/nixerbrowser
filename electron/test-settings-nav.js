const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-set-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  const waitTab = () => ui.executeJavaScript(`(async () => { for (let i = 0; i < 60; i++) { const t = document.querySelector('.tab'); if (t && t.dataset.id) return t.dataset.id; await new Promise(r => setTimeout(r, 200)) } return null })()`)
  const tab0 = await waitTab()
  if (!tab0) { console.log('NO_TAB'); app.exit(2); return }
  await delay(1000)
  await ui.executeJavaScript(`window.api.openPage('settings')`)
  await delay(1500)
  const tabs = await ui.executeJavaScript(`Array.from(document.querySelectorAll('.tab')).map(t => ({ id: t.dataset.id, title: t.querySelector('.tab-title').textContent, active: t.classList.contains('active') }))`)
  const activeUrl = await ui.executeJavaScript(`(async () => { const a = document.querySelector('.tab.active'); if (!a) return 'NO_ACTIVE'; return window.api.tabGetUrl(a.dataset.id) })()`)
  const settingsContent = await ui.executeJavaScript(`(async () => { for (let i = 0; i < 30; i++) { const w = document.querySelectorAll('.tab').length; if (w > 0 && document.body.textContent.includes('Permiso') || document.body.textContent.includes('Ajustes')) break; await new Promise(r => setTimeout(r, 200)) } return { hasSettings: document.body.textContent.includes('Ajustes'), tabs: document.querySelectorAll('.tab').length } })()`)
  console.log('SETTINGS:', JSON.stringify({ tabs, activeUrl, settingsContent }))
  const urlBefore = activeUrl
  await ui.executeJavaScript(`document.querySelector('.menu-btn').click(); true`)
  await delay(500)
  await ui.executeJavaScript(`document.querySelector('.menu-btn').click(); true`)
  await delay(600)
  const urlAfter = await ui.executeJavaScript(`(async () => { const a = document.querySelector('.tab.active'); if (!a) return 'NO_ACTIVE'; return window.api.tabGetUrl(a.dataset.id) })()`)
  console.log('AFTER_MENU_TOGGLE:', JSON.stringify({ urlBefore, urlAfter, same: urlBefore === urlAfter }))
  win.close()
  setTimeout(() => app.exit(0), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
