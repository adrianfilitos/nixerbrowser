const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

app.whenReady().then(async () => {
  const tmp = path.join(os.tmpdir(), 'nixer-newtab-test')
  fs.rmSync(tmp, { recursive: true, force: true })
  app.setPath('userData', tmp)

  const store = require('./store')
  ipcMain.handle('settings:get', () => store.settings())
  ipcMain.handle('settings:set', (_e, p) => store.setSettings(p))
  ipcMain.handle('history:list', () => store.listHistory())
  ipcMain.handle('search:url', (_e, q) => store.searchUrl(q))

  store.setSettings({
    shortcuts: [
      { id: 'a', title: 'Gmail', url: 'https://gmail.com', color: '#ea4335' },
      { id: 'b', title: 'Maps', url: 'https://maps.google.com', color: '#34a853' },
    ],
    greeting: 'Hola Mundo',
    showClock: false,
    showSearch: false,
    showRecent: true,
  })
  store.addHistory({ url: 'https://github.com', title: 'GitHub', ts: Date.now() })
  store.addHistory({ url: 'https://example.com', title: 'https://example.com', ts: Date.now() })

  const win = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, sandbox: false, preload: path.join(__dirname, 'view-preload.js') },
  })
  await win.loadFile(path.join(__dirname, '..', 'newtab.html'))
  await new Promise((r) => setTimeout(r, 1200))

  const r = await win.webContents.executeJavaScript(`(function () {
    var links = document.querySelectorAll('#links .link')
    var cards = Array.from(document.querySelectorAll('.recent-card')).map(function (c) {
      return { title: c.querySelector('.rc-title').textContent, host: c.querySelector('.rc-host').textContent }
    })
    return {
      count: links.length,
      first: links.length ? links[0].textContent.trim() : null,
      greet: document.getElementById('greet').textContent,
      topHidden: document.querySelector('.top').classList.contains('hidden'),
      qHidden: document.getElementById('searchWrap').classList.contains('hidden'),
      recentHidden: document.getElementById('recentBlock').classList.contains('hidden'),
      cards: cards,
    }
  })()`)

  console.log('NEWTAB:', JSON.stringify(r))
  const cardTitles = (r.cards || []).map((c) => c.title)
  const ok =
    r.count === 2 &&
    r.first === 'Gmail' &&
    r.greet === 'Hola Mundo' &&
    r.topHidden && r.qHidden && !r.recentHidden &&
    cardTitles.indexOf('GitHub') !== -1 &&
    cardTitles.indexOf('example.com') !== -1 &&
    !cardTitles.some((t) => t === 'https://example.com')
  console.log('RESULT:', ok ? 'NEWTAB_OK' : 'NEWTAB_FAIL')
  app.exit(ok ? 0 : 1)
}).catch((e) => { console.log('ERR', e && e.message); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 25000)
