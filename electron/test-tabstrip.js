const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-tabstrip-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const store = require('./store')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  store.setSettings({ tabMinWidth: 120 })
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws[0]; else await delay(400) }
  const ui = win.webContents
  await delay(1800)
  const results = {}

  // 1) Crear muchas pestañas viajando por el menú? No: usar el api de pestañas.
  // Se crean pestañas con window.api.openNewTab para llenar el strip.
  for (let i = 0; i < 18; i++) {
    await ui.executeJavaScript(`window.api.openNewTab('https://example.com/page${i}')`).catch(() => {})
    await delay(120)
  }
  await delay(1500)

  results.tabCount = await ui.executeJavaScript(`document.querySelectorAll('.tab').length`)

  // 2) Compactación: con 19 pestañas el ancho por pestaña debe ser < 120px y las
  //    estrechas deben tener clase .narrow (título oculto).
  results.widths = await ui.executeJavaScript(`Array.from(document.querySelectorAll('.tab')).slice(0, 5).map(t => Math.round(t.getBoundingClientRect().width)).join(',')`)
  results.compacted = await ui.executeJavaScript(`(() => { const ts = Array.from(document.querySelectorAll('.tab')); const w = ts[0].getBoundingClientRect().width; return w < 120 })()`)
  results.narrowApplied = await ui.executeJavaScript(`(() => { const ts = Array.from(document.querySelectorAll('.tab')); return ts.some(t => t.classList.contains('narrow')) })()`)
  results.narrowHidesTitle = await ui.executeJavaScript(`(() => { const t = document.querySelector('.tab.narrow'); if (!t) return false; const title = t.querySelector('.tab-title'); return title ? getComputedStyle(title).display === 'none' : false })()`)
  results.crowdedClass = await ui.executeJavaScript(`document.querySelector('.tab-strip').classList.contains('crowded')`)

  // 3) Scroll: activar la última pestaña -> el strip debe scrollar (scrollLeft>0
  //    o el borde derecho de la activa dentro del contenedor visible).
  const lastId = await ui.executeJavaScript(`(() => { const ts = Array.from(document.querySelectorAll('.tab')); return ts[ts.length - 1].dataset.id })()`)
  await ui.executeJavaScript(`(() => { const t = document.querySelector('.tab[data-id="${lastId}"]'); if (t) t.click(); return !!t })()`).catch(() => {})
  await delay(900)
  results.scrollState = await ui.executeJavaScript(`(() => {
    const list = document.querySelector('.tab-list')
    const act = document.querySelector('.tab.active')
    if (!list || !act) return 'NO_EL'
    const lr = list.getBoundingClientRect()
    const ar = act.getBoundingClientRect()
    const visible = ar.left >= lr.left - 1 && ar.right <= lr.right + 8
    const ts = Array.from(document.querySelectorAll('.tab'))
    const last = ts[ts.length - 1] ? ts[ts.length - 1].getBoundingClientRect() : null
    return { scrollLeft: list.scrollLeft, visible, scrollWidth: list.scrollWidth, clientWidth: list.clientWidth, activeIdx: ts.indexOf(act), lastRight: last ? Math.round(last.right) : null, lrRight: Math.round(lr.right), arRight: Math.round(ar.right) }
  })()`)
  results.scrolledToActive = results.scrollState && (results.scrollState.scrollLeft > 0 || results.scrollState.visible)

  console.log('TS:', JSON.stringify(results))
  const ok = results.tabCount >= 18 && results.compacted && results.crowdedClass && results.narrowApplied && results.narrowHidesTitle && results.scrolledToActive && results.scrollState && results.scrollState.visible === true && (results.widths.split(',')[0] === '56' || Number(results.widths.split(',')[0]) < 80)
  console.log('RESULT:', ok ? 'TS_OK' : 'TS_FAIL')
  win.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 120000)
