const { app, BrowserWindow } = require('electron')
const http = require('http')

const YT = require('./yt-script')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))

const AD_JSON = JSON.stringify({ adPlacements: [{ renderer: { adSlotRenderer: { x: 1 } } }], playerAds: [{ y: 2 }], ok: 'content' })

const SIM_HTML = `<!doctype html><html><body>
<script>
  window.ytInitialPlayerResponse = { adPlacements: [{ a: 1 }], playerAds: [{ b: 2 }], streamingData: { adaptiveFormats: [{ itag: 18 }] }, ok: 'content' }
  window.__simParse = function () { return JSON.parse('${AD_JSON}') }
  window.__simFetch = function () { return fetch('/youtubei/v1/player').then(function (r) { return r.json() }) }
  window.__simXhr = function () { return new Promise(function (res) { var x = new XMLHttpRequest(); x.open('GET', '/youtubei/v1/player'); x.onload = function () { res({ text: x.responseText, obj: JSON.parse(x.responseText) }) }; x.send() }) }
</script>
<h1 id="ok">sim</h1>
</body></html>`

app.whenReady().then(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', (req.url.indexOf('youtubei') !== -1) ? 'application/json' : 'text/html')
    res.end(req.url.indexOf('youtubei') !== -1 ? AD_JSON : SIM_HTML)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port
  const base = 'http://127.0.0.1:' + port

  const win = new BrowserWindow({ width: 600, height: 400, show: false, webPreferences: { sandbox: false, contextIsolation: true } })
  await win.loadURL(base + '/')

  // Inyectar el scriptlet en el main world
  await win.webContents.executeJavaScript(YT)
  await delay(1800)

  const results = await win.webContents.executeJavaScript(`(async () => {
    const p = window.__simParse()
    const f = await window.__simFetch()
    const x = await window.__simXhr()
    const init = window.ytInitialPlayerResponse
    return {
      parseAds: p.adPlacements || p.playerAds ? 'AD' : 'clean',
      parseOk: p.ok,
      fetchAds: f.adPlacements || f.playerAds ? 'AD' : 'clean',
      fetchOk: f.ok,
      xhrAds: x.obj.adPlacements || x.obj.playerAds ? 'AD' : 'clean',
      xhrOk: x.obj.ok,
      initAds: init.adPlacements || init.playerAds ? 'AD' : 'clean',
      initStreaming: !!(init.streamingData && init.streamingData.adaptiveFormats),
      initOk: init.ok,
      pageWorks: document.getElementById('ok').textContent === 'sim',
    }
  })()`).catch((e) => ({ err: String(e) }))

  console.log('YT:', JSON.stringify(results))
  const ok = results.err ? false
    : results.parseAds === 'clean' && results.parseOk === 'content'
      && results.fetchAds === 'clean' && results.fetchOk === 'content'
      && results.xhrAds === 'clean' && results.xhrOk === 'content'
      && results.initAds === 'clean' && results.initStreaming === true && results.initOk === 'content'
      && results.pageWorks === true
  console.log('RESULT:', ok ? 'YT_ADBLOCK_OK' : 'YT_ADBLOCK_FAIL')
  server.close()
  win.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 60000)
