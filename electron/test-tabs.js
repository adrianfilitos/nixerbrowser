const { app, BrowserWindow } = require('electron')
require('./main')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  await delay(4000)
  const win = BrowserWindow.getAllWindows()[0]
  const ui = win.webContents

  for (let i = 0; i < 3; i++) {
    await ui.executeJavaScript(`document.querySelector('.new-tab').click(); true`)
    await delay(700)
  }
  const before = await ui.executeJavaScript(`document.querySelectorAll('.tab').length`)

  await ui.executeJavaScript(`document.querySelector('.tab-manage').click(); true`)
  await delay(400)
  const menu = await ui.executeJavaScript(`(function () {
    const el = document.querySelector('.tab-manage-menu')
    if (!el) return { open: false }
    return { open: true, tabs: el.querySelectorAll('.tm-tab').length, actions: Array.from(el.querySelectorAll('.tm-action')).map((b) => b.textContent.trim()) }
  })()`)

  const closed = await ui.executeJavaScript(`(function () {
    const el = Array.from(document.querySelectorAll('.tm-action')).find((b) => b.textContent.indexOf('Cerrar todas') !== -1)
    if (!el) return false
    el.click()
    return true
  })()`)
  await delay(1200)
  const after = await ui.executeJavaScript(`document.querySelectorAll('.tab').length`)

  const suggest = await ui.executeJavaScript(`(async () => {
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
  })()`)

  console.log('TABMANAGE:', JSON.stringify({ before, menu, closed, after, suggest }))
  const ok = before >= 3 && menu.open && menu.tabs >= 3 && closed === true && after === 1
  console.log('RESULT:', ok ? 'TABS_OK' : 'TABS_FAIL')
  app.exit(ok ? 0 : 1)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
