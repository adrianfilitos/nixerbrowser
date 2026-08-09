const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const http = require('http')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-ai-profile')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })

require('./main')
const store = require('./store')
const ai = require('./ai')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  const results = {}

  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json')
      if (req.url.indexOf('/chat/completions') !== -1 && req.method === 'POST') {
        const parsed = JSON.parse(body || '{}')
        res.end(JSON.stringify({ choices: [{ message: { content: 'RESPUESTA:' + (parsed.model || '?') + ':' + (parsed.messages || []).map((m) => m.content).join('|') } }] }))
      } else {
        res.end(JSON.stringify({ error: 'noop' }))
      }
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port

  store.setSettings({
    aiBaseUrl: 'http://127.0.0.1:' + port + '/v1',
    aiApiKey: store.encryptSecret('sk-clave-test'),
    aiModel: 'mock-model',
    aiTemperature: 0.2,
    aiMaxTokens: 500,
  })

  // 1) Llamada directa al módulo IA (usa cifrado)
  const r = await ai.chat([{ role: 'user', content: 'hola' }])
  results.direct = r && r.text
  results.noError = !r.error

  // 2) round-trip de cifrado de la clave
  results.keyEncrypted = store.settings().aiApiKey.indexOf('sk-clave-test') === -1
  results.keyDecrypts = store.decryptSecret(store.settings().aiApiKey) === 'sk-clave-test'

  // 3) La UI expone aiChat y openPage
  let normal = null
  for (let i = 0; i < 20 && !normal; i++) {
    const ws = BrowserWindow.getAllWindows()
    if (ws.length) normal = ws[0]
    else await delay(500)
  }
  const ui = normal.webContents
  await delay(1500)
  const api = await ui.executeJavaScript(`({ aiChat: typeof window.api.aiChat, openPage: typeof window.api.openPage })`)
  results.uiApi = api

  // 4) La página de IA muestra estado "Conectado"
  for (let i = 0; i < 8; i++) {
    const has = await ui.executeJavaScript(`!!document.querySelector('webview.active')`).catch(() => false)
    if (has) break
    await delay(500)
  }
  await ui.executeJavaScript(`(() => { const wv = document.querySelector('webview.active'); if (wv) wv.loadURL('nixer://ai'); return true })()`)
  await delay(2500)
  const aiDiag = await Promise.race([
    ui.executeJavaScript(`(async () => {
      const wv = document.querySelector('webview.active')
      const out = await wv.executeJavaScript(\`(async function () {
        const d = { url: location.href, browserAPI: typeof window.browserAPI, status: document.getElementById('status').textContent, hasSend: !!document.getElementById('send'), sendOnclick: typeof document.getElementById('send').onclick }
        if (window.browserAPI) { try { const s = await window.browserAPI.settings.get(); d.base = s.aiBaseUrl; d.key = s.aiApiKey; d.model = s.aiModel } catch (e) { d.sgErr = String(e) } }
        return d
      })()\`)
      return out
    })()`),
    new Promise((r) => setTimeout(() => r('TIMEOUT'), 6000)),
  ])
  results.aiDiag = aiDiag
  const aiPage = aiDiag

  server.close()
  normal.close()
  console.log('AI:', JSON.stringify({ results }))
  const ok = results.direct === 'RESPUESTA:mock-model:hola' && !results.noError === false &&
    results.keyEncrypted && results.keyDecrypts &&
    results.uiApi.aiChat === 'function' && results.uiApi.openPage === 'function' &&
    typeof aiDiag === 'object' && aiDiag.browserAPI === 'object' && String(aiDiag.status).indexOf('Conectado') !== -1
  console.log('RESULT:', ok ? 'AI_OK' : 'AI_FAIL')
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
