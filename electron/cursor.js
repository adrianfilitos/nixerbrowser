const { BrowserWindow } = require('electron')
const path = require('path')

const SIZE = 22
const wins = new Map()

// El cursor XInput es una mini-VENTANA transparente siempre encima de la página
// (externa a la ventana principal, como los menús: nunca congela el repintado).
// Ignora el ratón para no bloquear los clics en la página.
function ensure(wctx) {
  if (!wctx || !wctx.win || wctx.win.isDestroyed()) return null
  let win = wins.get(wctx)
  if (win && !win.isDestroyed()) return win
  win = new BrowserWindow({
    parent: wctx.win,
    width: SIZE,
    height: SIZE,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: false,
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })
  win.loadFile(path.join(__dirname, '..', 'pages', 'cursor.html'))
  try { win.webContents.setIgnoreMouseEvents(true, { forward: true }) } catch {}
  wins.set(wctx, win)
  return win
}

function update(wctx, x, y, visible) {
  const win = ensure(wctx)
  if (!win) return
  if (!visible || !Number.isFinite(x) || !Number.isFinite(y)) {
    try { win.hide() } catch {}
    return
  }
  let bx = 0
  let by = 0
  try {
    const cb = wctx.win.getContentBounds()
    bx = cb.x || 0
    by = cb.y || 0
  } catch {}
  try {
    win.setPosition(Math.round(bx + x - SIZE / 2), Math.round(by + y - SIZE / 2))
    win.show()
  } catch {}
}

function hideAll(wctx) {
  const win = wins.get(wctx)
  if (win) { try { win.hide() } catch {} }
}

module.exports = { update, hideAll, ensure }
