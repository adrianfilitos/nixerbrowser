const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-tabs-profile')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })

require('./main')
const store = require('./store')
store.setSettings({ confirmCloseMultiple: false })

const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const wto = (p, ms, tag) => Promise.race([p, new Promise((r) => setTimeout(() => r('TIMEOUT:' + tag), ms))])

app.whenReady().then(async () => {
  let normal = null
  for (let i = 0; i < 20 && !normal; i++) {
    const ws = BrowserWindow.getAllWindows()
    if (ws.length) normal = ws[0]
    else await delay(500)
  }
  const ui = normal.webContents
  const errs = []
  ui.on('console-message', (_e, level, message) => { if (level >= 3) errs.push(String(message)) })

  for (let i = 0; i < 3; i++) {
    await wto(ui.executeJavaScript(`document.querySelector('.new-tab').click(); true`), 8000, 'newtab')
    await delay(700)
  }
  const before = await wto(ui.executeJavaScript(`document.querySelectorAll('.tab').length`), 8000, 'count')

  await wto(ui.executeJavaScript(`document.querySelector('.tab-manage').click(); true`), 8000, 'manage')
  await delay(400)
  const menu = await wto(ui.executeJavaScript(`(function () {
    const el = document.querySelector('.tab-manage-menu')
    if (!el) return { open: false }
    return { open: true, tabs: el.querySelectorAll('.tm-tab').length, actions: Array.from(el.querySelectorAll('.tm-action')).map((b) => b.textContent.trim()) }
  })()`), 8000, 'menu')

  const closed = await wto(ui.executeJavaScript(`(function () {
    const el = Array.from(document.querySelectorAll('.tm-action')).find((b) => b.textContent.indexOf('Cerrar todas') !== -1)
    if (!el) return false
    el.click()
    return true
  })()`), 8000, 'close')
  await delay(1200)
  const after = await wto(ui.executeJavaScript(`document.querySelectorAll('.tab').length`), 8000, 'after')

  const suggest = await wto(ui.executeJavaScript(`(async () => {
    const wv = document.querySelector('webview.active')
    const r = await wv.executeJavaScript(\`(async function () {
      const input = document.getElementById('q')
      if (!input) return { noInput: true }
      const setVal = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setVal.call(input, 'you')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 1200))
      return { items: document.querySelectorAll('.suggest-item').length, api: typeof browserAPI.search.suggest }
    })()\`)
    return r
  })()`), 12000, 'suggest')

  console.log('TABMANAGE:', JSON.stringify({ before, menu, closed, after, suggest, errs }))
  const ok = before >= 3 && menu.open && menu.tabs >= 3 && closed === true && after === 1 && errs.length === 0
  console.log('RESULT:', ok ? 'TABS_OK' : 'TABS_FAIL')
  normal.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
