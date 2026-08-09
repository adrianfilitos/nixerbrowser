const { app, BrowserWindow, session } = require('electron')
const http = require('http')
const fs = require('fs')
const path = require('path')

app.whenReady().then(async () => {
  const tmp = path.join(require('os').tmpdir(), 'nixer-ext-test')
  fs.mkdirSync(tmp, { recursive: true })
  fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify({
    manifest_version: 2,
    name: 'TestExt',
    version: '1.0',
    content_scripts: [{ matches: ['http://127.0.0.1:*/*'], js: ['content.js'] }],
  }))
  fs.writeFileSync(path.join(tmp, 'content.js'), 'document.title = "EXT_LOADED"; document.body.style.background = "rgb(255,0,0)";')

  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<h1>page</h1>') })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port

  const ext = await session.defaultSession.loadExtension(tmp)
  console.log('EXT_ID:', ext.id, 'NAME:', ext.name)
  console.log('ALL_EXTENSIONS:', session.defaultSession.getAllExtensions().length)

  const win = new BrowserWindow({ width: 900, height: 600, show: false, webPreferences: { webviewTag: true, sandbox: false, contextIsolation: true } })
  win.loadURL('data:text/html,<webview id="wv" src="http://127.0.0.1:' + port + '/" style="width:100%;height:100%"></webview>')
  await new Promise((r) => setTimeout(r, 3000))

  const title = await win.webContents.executeJavaScript(`(async () => { const wv = document.getElementById('wv'); return await wv.executeJavaScript('document.title') })()`)
  console.log('WEBVIEW_TITLE:', title)
  console.log('RESULT:', title === 'EXT_LOADED' ? 'EXTENSION_OK' : 'EXTENSION_FAIL')
  server.close()
  app.exit(title === 'EXT_LOADED' ? 0 : 1)
}).catch((e) => { console.log('ERR', e && e.message); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 25000)
