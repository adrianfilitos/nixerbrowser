const { app, BrowserWindow, session } = require('electron')
const path = require('path')
require('./nixer').registerScheme()

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  require('./nixer').install([session.defaultSession, session.fromPartition('test-priv')])
  const win = new BrowserWindow({ show: false, webPreferences: { webviewTag: true, sandbox: false, contextIsolation: true } })
  win.loadURL('data:text/html,<webview id="wv" partition="test-priv" src="nixer://settings" style="width:100%;height:100%"></webview>')
  await delay(4000)
  const r = await win.webContents.executeJavaScript(`(async () => {
    const wv = document.getElementById('wv')
    const out = { url: wv.getURL(), loading: wv.isLoading() }
    try { out.title = await wv.executeJavaScript('document.title') } catch (e) { out.title = 'ERR:' + e.message }
    return out
  })()`)
  console.log('PRIVATE_NIXER:', JSON.stringify(r))
  app.exit(0)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 30000)
