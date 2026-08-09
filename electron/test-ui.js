const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-ui-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })

require('./main')
const store = require('./store')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  store.addHistory({ url: 'https://github.com', title: 'GitHub' })
  store.addHistory({ url: 'https://nixer.example', title: 'Nixer Example' })
  await delay(4000)
  const win = BrowserWindow.getAllWindows()[0]
  const ui = win.webContents
  ui.on('console-message', (_e, level, message) => {
    if (level >= 3) console.log('UI_ERR:', message)
  })

  await ui.executeJavaScript(`document.querySelector('.menu-btn').click(); true`)
  await delay(400)
  const clicked = await ui.executeJavaScript(`(function(){ const el = Array.from(document.querySelectorAll('.drop-item')).find(x => x.textContent.indexOf('Ajustes') !== -1); if (el) { el.click(); return true } return false })()`)
  await delay(2500)

  const bar = await ui.executeJavaScript(`(function(){
    const input = document.querySelector('.address-bar input')
    const chip = document.querySelector('.internal-chip')
    return { hasInput: !!input, chip: chip ? chip.textContent : null, placeholder: input ? input.placeholder : null, readonly: input ? input.readOnly : null }
  })()`)
  console.log('BAR:', JSON.stringify(bar))

  const inline = await ui.executeJavaScript(`(async () => {
    const input = document.querySelector('.address-bar input')
    if (!input) return { input: false }
    input.focus()
    const setVal = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setVal.call(input, 'git')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 900))
    const ghost = document.querySelector('.inline-ghost')
    const dd = document.querySelector('.autocomplete')
    return { ghost: ghost ? ghost.textContent : null, dropdown: !!dd, suggestions: dd ? dd.querySelectorAll('.suggestion').length : 0 }
  })()`)
  console.log('INLINE:', JSON.stringify(inline))

  const barOk = !!(bar && bar.hasInput && bar.readonly === false && bar.chip === 'Ajustes' && /nixer:\/\/settings/.test(bar.placeholder || ''))
  const inlineOk = !!(inline && inline.ghost && inline.ghost.indexOf('github') !== -1)
  console.log('RESULT:', barOk && inlineOk ? 'UI_OK' : 'UI_FAIL')
  app.exit(barOk && inlineOk ? 0 : 1)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
