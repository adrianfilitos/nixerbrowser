const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const http = require('http')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-ai-ground-test')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const store = require('./store')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  let win = null
  for (let i = 0; i < 25 && !win; i++) { const ws = BrowserWindow.getAllWindows(); if (ws.length) win = ws.find((w) => w.webContents.getURL().includes('index.html')) || ws[0]; else await delay(400) }
  const ui = win.webContents
  await delay(1500)
  const results = {}

  // Servidor mock que devuelve el mensaje SYSTEM (lo que main aumentó).
  let received = null
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      try {
        const data = JSON.parse(body)
        received = data.messages || []
        const system = (data.messages || []).find((m) => m.role === 'system')
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: system ? system.content : 'NO_SYSTEM' } }] }))
      } catch { res.end('{}') }
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  store.setSettings({ aiBaseUrl: 'http://127.0.0.1:' + port, aiApiKey: store.encryptSecret('sk-test'), aiModel: 'mock' })

  // Abrir una pestaña para poder referenciarla con @
  await ui.executeJavaScript(`window.api.openNewTab('https://example.com'); true`).catch(() => {})
  await delay(4000)

  // Sin @ (verifica grounding por búsqueda)
  const r1 = await ui.executeJavaScript(`window.api.aiChat([{ role: 'user', content: '¿qué hay de nuevo?' }])`)
  results.withSearch = !!received && received.some((m) => m.role === 'system' && (/Resultados de búsqueda|No se obtuvieron resultados de búsqueda/i.test(m.content || '')))
  results.r1 = r1 && r1.text

  // Con @pestaña
  const r2 = await ui.executeJavaScript(`window.api.aiChat([{ role: 'user', content: 'resume @example en español' }])`)
  results.withAt = !!received && received.some((m) => m.role === 'system' && /Pestaña @/.test(m.content || ''))
  results.r2 = r2 && r2.text

  server.close()
  console.log('AIG:', JSON.stringify(results))
  const ok = results.withSearch && results.withAt
  console.log('RESULT:', ok ? 'AIG_OK' : 'AIG_FAIL')
  win.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 120000)
