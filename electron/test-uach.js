const { app, BrowserWindow, session } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-uach-profile')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })

require('./main')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  const ses = session.defaultSession
  const cleanUa = ses.getUserAgent()
  let dump = null
  ses.webRequest.onBeforeSendHeaders({ urls: ['*://accounts.google.com/*'] }, (d, cb) => {
    if (!dump) dump = { url: d.url, keys: Object.keys(d.requestHeaders), full: d.requestHeaders }
    cb({ requestHeaders: d.requestHeaders })
  })
  const win = new BrowserWindow({ show: false })
  win.loadURL('https://accounts.google.com/nixer-uach-probe').catch(() => {})
  await delay(5000)
  console.log('SESSION_UA:', cleanUa)
  console.log('G_KEYS:', dump ? JSON.stringify(dump.keys) : 'NONE')
  console.log('G_FULL:', dump ? JSON.stringify(dump.full) : 'NONE')
  const noElectron = cleanUa.indexOf('Electron/') === -1 && cleanUa.indexOf('navegador/') === -1 && cleanUa.indexOf('NixerBrowser/') === -1
  const hasChrome = cleanUa.indexOf('Chrome/') !== -1
  const gotGoogle = !!dump
  console.log('UACH:', JSON.stringify({ noElectron, hasChrome, gotGoogle }))
  const ok = noElectron && hasChrome && gotGoogle
  console.log('RESULT:', ok ? 'UACH_OK' : 'UACH_FAIL')
  app.exit(ok ? 0 : 1)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 60000)
