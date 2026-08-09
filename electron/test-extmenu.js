const { app, BrowserWindow, session } = require('electron')
require('./main')
const path = require('path')
const fs = require('fs')
const os = require('os')

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
  const wv = await ui.executeJavaScript(`(() => { const wv = document.querySelector('webview.active'); if (!wv) return null; wv.loadURL('nixer://extensions'); return true })()`)
  await delay(2500)

  const r = await ui.executeJavaScript(`(async () => {
    const wv = document.querySelector('webview.active')
    return await wv.executeJavaScript(\`(function () {
      var cards = Array.from(document.querySelectorAll('.card'))
      var menuExt = cards.find(function (c) { return c.querySelector('.ext-title b') && c.querySelector('.ext-title b').textContent.indexOf('Menu Ext') === 0 })
      if (!menuExt) return { found: false, total: cards.length }
      return {
        found: true,
        total: cards.length,
        hasIcon: !!menuExt.querySelector('.ext-icon') && menuExt.querySelector('.ext-icon').tagName === 'IMG',
        optionsVisible: menuExt.querySelector('[data-a="options"]').style.display !== 'none',
        homeVisible: menuExt.querySelector('[data-a="home"]').style.display !== 'none',
        meta: menuExt.querySelector('.card-meta').textContent,
        switchOn: menuExt.querySelector('[data-a="sw"]').classList.contains('on'),
      }
    })()\`)
  })()`)

  console.log('EXTPAGE:', JSON.stringify(r))
  const ok = !!r && r.found && r.hasIcon && r.optionsVisible && r.homeVisible && r.switchOn
  console.log('RESULT:', ok ? 'EXTMENU_OK' : 'EXTMENU_FAIL')
  app.exit(ok ? 0 : 1)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
