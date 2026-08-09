const { app, BrowserWindow } = require('electron')
const path = require('path')
const nixer = require('./nixer')
nixer.registerScheme()

app.whenReady().then(async () => {
  nixer.install()
  const win = new BrowserWindow({
    show: false,
    webPreferences: { webviewTag: true, sandbox: false, contextIsolation: true },
  })

  async function probe(src) {
    await win.loadURL('data:text/html,<webview src="' + src + '" style="width:100%;height:100%"></webview>')
    await new Promise((r) => setTimeout(r, 1500))
    return win.webContents.executeJavaScript(
      `(async () => { const wv = document.querySelector('webview'); return { url: wv.getURL(), h1: await wv.executeJavaScript("document.querySelector('h1') ? document.querySelector('h1').textContent : null") } })()`
    )
  }

  const settings = await probe('nixer://settings')
  console.log('NIXER_SETTINGS:', JSON.stringify(settings))
  const settingsOk = settings.url.indexOf('nixer://settings') === 0 && settings.h1 === 'Ajustes'

  const pages = await probe('nixer://pages/settings.html')
  console.log('NIXER_PAGES:', JSON.stringify(pages))
  const pagesOk = pages.h1 === 'Ajustes'

  const ext = await probe('nixer://extensions')
  console.log('NIXER_EXTENSIONS:', JSON.stringify(ext))
  const extOk = ext.url.indexOf('nixer://extensions') === 0 && !!ext.h1

  const notFound = await probe('nixer://noexiste')
  const nfOk = String(notFound.h1 || '').length === 0

  const ok = settingsOk && pagesOk && extOk && nfOk
  console.log('RESULT:', ok ? 'NIXER_OK' : 'NIXER_FAIL')
  app.exit(ok ? 0 : 1)
}).catch((e) => { console.log('ERR', e && e.message); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 30000)
