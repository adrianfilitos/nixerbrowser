const { app, BrowserWindow, webContents } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-error-profile')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

const BAD_URL = 'http://no-such-host-nixer.invalid/'
const GOOD_URL = 'nixer://newtab'

app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 20 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const uia = win.webContents
  await delay(1800)

  // Obtener la webview ACTIVA y navegarla a una URL que fallará (como escribir una URL en la barra)
  let wcId = null
  for (let i = 0; i < 30 && !wcId; i++) {
    wcId = await uia.executeJavaScript(`(() => {
      const v = document.querySelector('.page-view.active')
      return v ? v.getWebContentsId() : null
    })()`).catch(() => null)
    if (!wcId) await delay(500)
  }
  if (!wcId) { console.log('NO_WC'); app.exit(2); return }
  const wc = webContents.fromId(wcId)
  if (!wc || wc.isDestroyed()) { console.log('NO_WC2'); app.exit(2); return }

  // Flujo real: teclear la URL en la barra de direcciones y pulsar Enter
  await uia.executeJavaScript(`(() => {
    const input = document.querySelector('.address-bar input')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, ${JSON.stringify(BAD_URL)})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    const form = document.querySelector('.address-bar form')
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    return true
  })()`)
  await delay(4500)

  const state = await uia.executeJavaScript(`(() => {
    const input = document.querySelector('.address-bar input')
    const chip = document.querySelector('.internal-chip')
    const activeTab = document.querySelector('.tab.active')
    return {
      addr: input ? input.value : null,
      chip: chip ? chip.textContent : null,
      activeTitle: activeTab ? activeTab.getAttribute('title') : null,
      internal: !!(chip && chip.textContent),
    }
  })()`)

  const href = await wc.executeJavaScript('location.href').catch(() => 'ERR')
  const text = await wc.executeJavaScript('document.body ? document.body.innerText : ""').catch(() => 'ERR')
  const meta = await wc.executeJavaScript('document.getElementById("meta") ? document.getElementById("meta").innerText : ""').catch(() => 'ERR')

  const pageOk = String(href).indexOf('nixer://error') === 0
  const textOk = String(text).toLowerCase().indexOf('no se pudo') !== -1 || String(text).toLowerCase().indexOf('no se puede acceder') !== -1
  const addrOk = state.addr === BAD_URL
  const titleOk = state.activeTitle && state.activeTitle.indexOf('No se puede acceder') !== -1

  let reloadOk = false
  if (pageOk) {
    await wc.executeJavaScript(`document.getElementById('reload').click(); true`).catch(() => {})
    await delay(3500)
    const h2 = await wc.executeJavaScript('location.href').catch(() => 'ERR')
    reloadOk = String(h2).indexOf('nixer://error') === 0
  }

  await wc.executeJavaScript(`location.href = ${JSON.stringify(GOOD_URL)}; true`).catch(() => {})
  await delay(2500)
  const h3 = await wc.executeJavaScript('location.href').catch(() => 'ERR')
  const clearedOk = String(h3).indexOf('nixer://newtab') === 0

  console.log('ERROR_PAGE:', JSON.stringify({ pageOk, textOk, addrOk, titleOk, reloadOk, clearedOk, addr: state.addr, chip: state.chip, href: String(href).slice(0, 90), meta }))
  const ok = pageOk && textOk && addrOk && titleOk && reloadOk && clearedOk
  console.log('RESULT:', ok ? 'ERROR_PAGE_OK' : 'ERROR_PAGE_FAIL')
  win.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 120000)
