const { app, BrowserWindow, session } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-extmenu-profile')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })

require('./main')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const store = require('./store')

app.whenReady().then(async () => {
  await delay(4000)

  const tmp = path.join(os.tmpdir(), 'nixer-extmenu-test')
  fs.rmSync(tmp, { recursive: true, force: true })
  fs.mkdirSync(path.join(tmp, 'icons'), { recursive: true })
  fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify({
    manifest_version: 2,
    name: 'Menu Ext',
    version: '2.1',
    icons: { 16: 'icons/16.png', 48: 'icons/16.png' },
    browser_action: { default_title: 'Menu Ext', default_icon: { 16: 'icons/16.png' } },
    options_page: 'options.html',
    homepage_url: 'https://example.org/menu-ext',
    content_scripts: [{ matches: ['http://*/*'], js: ['cs.js'] }],
  }))
  fs.writeFileSync(path.join(tmp, 'icons', '16.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'))
  fs.writeFileSync(path.join(tmp, 'options.html'), '<html><body><h1>options</h1></body></html>')
  fs.writeFileSync(path.join(tmp, 'cs.js'), '')

  const ext = await session.defaultSession.loadExtension(tmp)
  store.addExtension({ id: ext.id, name: 'Menu Ext', version: '2.1', contentScripts: [], folder: tmp })

  const win = BrowserWindow.getAllWindows()[0]
  const ui = win.webContents
  await ui.executeJavaScript(`document.querySelector('.new-tab').click(); true`)
  await delay(1500)
  await ui.executeJavaScript(`(() => { const wv = document.querySelector('webview.active'); if (wv) wv.loadURL('nixer://extensions'); return true })()`)
  await delay(2500)

  const r = await ui.executeJavaScript(`(async () => {
    const wv = document.querySelector('webview.active')
    const inner = await wv.executeJavaScript(\`(async function () {
      var out = { url: location.href, title: document.title, hasAPI: typeof browserAPI }
      try { out.list = await browserAPI.extensions.list() } catch (e) { out.err = String(e) }
      out.cards = document.querySelectorAll('.card').length
      return out
    })()\`)
    return inner
  })()`)

  console.log('EXTPAGE:', JSON.stringify(r))
  const ok = !!r && Array.isArray(r.list) && r.list.length > 0 && r.cards > 0
  console.log('RESULT:', ok ? 'EXTMENU_OK' : 'EXTMENU_FAIL')
  app.exit(ok ? 0 : 1)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
