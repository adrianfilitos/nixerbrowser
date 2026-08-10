const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-auth-flow-profile')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })

require('./main')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))
const EMAIL = process.env.GOOGLE_TEST_EMAIL || 'adrianfilitos@gmail.com'

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { webviewTag: true, contextIsolation: true, sandbox: false },
  })
  await win.loadURL('data:text/html,<webview id="wv" src="https://accounts.google.com/" style="width:1280px;height:800px"></webview>')
  await delay(22000)

  const r1 = await win.webContents.executeJavaScript(`(async () => {
    const wv = document.getElementById('wv')
    if (!wv) return { noWv: true }
    try {
      return await wv.executeJavaScript(\`(async () => {
        const text = (document.body && document.body.innerText || '').slice(0, 800)
        const blockMsg = /no es seguro|may not be secure|no es un navegador|inseguro/i.test(text)
        const email = document.querySelector('input[type="email"], input[name="identifier"], #identifierId')
        const next = document.querySelector('#identifierNext, button[type="submit"]')
        if (!email || !next) return { stage: 'no-form', url: location.href, blockMsg, text: text.slice(0, 300) }
        const setVal = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        setVal.call(email, '${EMAIL}')
        email.dispatchEvent(new Event('input', { bubbles: true }))
        email.dispatchEvent(new Event('change', { bubbles: true }))
        next.click()
        return { stage: 'email-submitted', blockMsg }
      })()\`)
    } catch (e) { return { err: String(e) } }
  })()`)

  await delay(16000)

  const r2 = await win.webContents.executeJavaScript(`(async () => {
    const wv = document.getElementById('wv')
    if (!wv) return { noWv: true }
    try {
      return await wv.executeJavaScript(\`(async () => {
        const text = (document.body && document.body.innerText || '').slice(0, 2500)
        const pw = !!document.querySelector('input[type="password"], input[name="password"], #password')
        const emailStep = !!document.querySelector('#identifierId')
        const blockMsg = /no es seguro|may not be secure|no es un navegador|navegador o aplicaci/i.test(text)
        const captcha = /captcha|no eres un robot|not a robot|verificaci/i.test(text)
        return { url: location.href, title: document.title, pw, emailStep, blockMsg, captcha, textHead: text.slice(0, 300) }
      })()\`)
    } catch (e) { return { err: String(e) } }
  })()`)

  console.log('AUTH1:', JSON.stringify(r1))
  console.log('AUTH2:', JSON.stringify(r2))
  const ok = !r2.blockMsg && r2.pw
  console.log('RESULT:', ok ? 'GOOGLE_AUTH_FLOW_OK' : 'GOOGLE_AUTH_FLOW_FAIL')
  try { win.destroy() } catch {}
  process.exit(ok ? 0 : 1)
}).catch((e) => { console.log('ERR', e && e.stack); process.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); process.exit(3) }, 150000)
