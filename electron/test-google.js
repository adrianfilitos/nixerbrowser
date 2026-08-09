const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-google-profile')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })

require('./main')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { webviewTag: true, contextIsolation: true, sandbox: false },
  })
  await win.loadURL('data:text/html,<webview id="wv" src="https://accounts.google.com/" style="width:1200px;height:800px"></webview>')
  await delay(25000)
  const r = await win.webContents.executeJavaScript(`(async () => {
    const wv = document.getElementById('wv')
    if (!wv) return { noWv: true }
    try {
      return await wv.executeJavaScript(\`(async () => {
        const text = (document.body && document.body.innerText || '').slice(0, 3000)
        const hasEmailInput = !!document.querySelector('input[type="email"], input[name="identifier"], #identifierId')
        const hasNextBtn = !!document.querySelector('#identifierNext, button[type="submit"]')
        const notSecure = /no es seguro|may not be secure|browser or app may not be secure|no es un navegador|inseguro/i.test(text)
        return {
          url: location.href,
          title: document.title,
          notSecure,
          hasEmailInput,
          hasNextBtn,
          ua: navigator.userAgent,
          uaBrands: (navigator.userAgentData && navigator.userAgentData.brands) ? JSON.stringify(navigator.userAgentData.brands) : 'none',
          textHead: text.slice(0, 300),
        }
      })()\`)
    } catch (e) { return { err: String(e) } }
  })()`)
  console.log('GOOGLE:', JSON.stringify(r))
  const ok = !!r && r.notSecure === false && r.hasEmailInput === true && /Chrome\//.test(r.ua || '')
  console.log('RESULT:', ok ? 'GOOGLE_LOGIN_OK' : 'GOOGLE_LOGIN_FAIL')
  try { win.destroy() } catch {}
  process.exit(ok ? 0 : 1)
}).catch((e) => { console.log('ERR', e && e.stack); process.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); process.exit(3) }, 90000)
