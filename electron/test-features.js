const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-features-profile')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })

require('./main')
const store = require('./store')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  store.addBookmark({ url: 'https://a.example', title: 'A', folder: 'Trabajo' })
  store.addBookmark({ url: 'https://b.example', title: 'B' })
  await delay(4000)
  const win = BrowserWindow.getAllWindows()[0]
  const ui = win.webContents
  ui.on('console-message', (_e, level, message) => {
    if (level >= 3) console.log('UI_ERR:', message)
  })

  async function newTabTo(url) {
    await ui.executeJavaScript(`document.querySelector('.new-tab').click(); true`)
    await delay(900)
    await ui.executeJavaScript(`(() => { const wv = document.querySelector('webview.active'); if (wv) wv.loadURL('${url}'); return true })()`)
    await delay(1800)
  }

  await newTabTo('nixer://bookmarks')
  const bm = await ui.executeJavaScript(`(async () => {
    const wv = document.querySelector('webview.active')
    return await wv.executeJavaScript(\`(function () {
      return {
        folders: document.querySelectorAll('.folder-head').length,
        rows: document.querySelectorAll('.row').length,
        folderName: document.querySelector('.folder-head .f-name') ? document.querySelector('.folder-head .f-name').textContent : null,
        selects: document.querySelectorAll('.folder-select').length,
      }
    })()\`)
  })()`)

  await newTabTo('nixer://about')
  const ab = await ui.executeJavaScript(`(async () => {
    const wv = document.querySelector('webview.active')
    return await wv.executeJavaScript(\`(function () {
      return { h1: document.querySelector('h1') ? document.querySelector('h1').textContent : null, rows: document.querySelectorAll('.row').length, ver: (document.getElementById('ver')||{}).textContent }
    })()\`)
  })()`)

  await ui.executeJavaScript(`(() => { const t = document.querySelector('.tab'); if (t) t.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 60, clientY: 60 })); return true })()`)
  await delay(400)
  const grpClick = await ui.executeJavaScript(`(function () {
    const el = Array.from(document.querySelectorAll('.ctx-item')).find((b) => b.textContent.indexOf('Crear nuevo grupo') !== -1)
    if (el) { el.click(); return true }
    return false
  })()`)
  await delay(600)
  const grp = await ui.executeJavaScript(`(function () {
    return { label: document.querySelectorAll('.tab-group-label').length, stripe: document.querySelectorAll('.tab-group-stripe').length }
  })()`)

  await ui.executeJavaScript(`document.querySelector('.new-tab').click(); true`)
  await delay(900)
  await ui.executeJavaScript(`document.querySelector('.tab-manage').click(); true`)
  await delay(400)
  const splitClicked = await ui.executeJavaScript(`(function () {
    const el = Array.from(document.querySelectorAll('.tm-action')).find((b) => b.textContent.indexOf('Dividir pantalla') !== -1)
    if (el) { el.click(); return true }
    return false
  })()`)
  await delay(800)
  const split = await ui.executeJavaScript(`(function () {
    return { container: document.querySelector('.page-container').classList.contains('splitscreen'), splitOn: document.querySelectorAll('webview.split-on').length }
  })()`)

  console.log('FEATURES:', JSON.stringify({ bm, ab, grpClick, grp, splitClicked, split }))
  const ok =
    bm.folders === 1 && bm.rows === 2 && bm.folderName === 'Trabajo' && bm.selects === 2 &&
    ab.h1 === 'Nixer Browser' && ab.rows > 0 &&
    grpClick && grp.label === 1 && grp.stripe === 1 &&
    splitClicked && split.container && split.splitOn === 1
  console.log('RESULT:', ok ? 'FEATURES_OK' : 'FEATURES_FAIL')
  app.exit(ok ? 0 : 1)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
