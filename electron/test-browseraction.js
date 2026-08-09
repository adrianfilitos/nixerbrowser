const { app, BrowserWindow, session } = require('electron')
require('./main')
const path = require('path')
const fs = require('fs')
const os = require('os')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-ba-profile')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  await delay(4000)
  const tmp = path.join(os.tmpdir(), 'nixer-ba-test')
  fs.rmSync(tmp, { recursive: true, force: true })
  fs.mkdirSync(path.join(tmp, 'icons'), { recursive: true })
  fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify({
    manifest_version: 2,
    name: 'BA Ext',
    version: '1.0',
    browser_action: { default_title: 'BA Ext', default_icon: { 16: 'icons/16.png' } },
    background: { scripts: ['bg.js'] },
  }))
  fs.writeFileSync(path.join(tmp, 'icons', '16.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'))
  fs.writeFileSync(path.join(tmp, 'bg.js'), '')

  const ext = await session.defaultSession.loadExtension(tmp)
  console.log('BA_EXT_LOADED:', !!ext, 'ALL:', session.defaultSession.getAllExtensions().length)

  const win = BrowserWindow.getAllWindows()[0]
  const ui = win.webContents
  ui.on('console-message', (_e, level, message) => {
    console.log('UI_CONSOLE[' + level + ']:', message)
  })
  await delay(2500)
  const r = await ui.executeJavaScript(`(async () => {
    const el = document.querySelector('browser-action-list')
    if (!el) return { exists: false }
    await new Promise((r) => setTimeout(r, 1200))
    const root = el.shadowRoot || el
    const actions = root.querySelectorAll ? root.querySelectorAll('[part="action"]') : []
    return { exists: true, shadow: !!el.shadowRoot, actions: actions.length }
  })()`)
  console.log('BROWSER_ACTION:', JSON.stringify(r))
  const ok = !!(r.exists && r.shadow && r.actions > 0)
  console.log('RESULT:', ok ? 'BA_OK' : 'BA_FAIL')
  app.exit(ok ? 0 : 1)
}).catch((e) => { console.log('ERR', e && e.message); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 60000)
