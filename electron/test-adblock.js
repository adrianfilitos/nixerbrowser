const { app, BrowserWindow, session } = require('electron')
const http = require('http')
const adblock = require('./adblock')

app.whenReady().then(async () => {
  adblock.init(session.defaultSession, () => ({ blockAds: true }))

  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html')
    res.end('<html><body><img src="https://example.com/a.png"><img src="https://doubleclick.net/b.png"><img src="https://adsrvr.org/c.png"></body></html>')
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port

  const win = new BrowserWindow({ width: 800, height: 600, show: false, webPreferences: { sandbox: true } })
  const done = []
  const errors = []
  session.defaultSession.webRequest.onCompleted({ urls: ['*://*/*'] }, (d) => done.push(d.url))
  session.defaultSession.webRequest.onErrorOccurred({ urls: ['*://*/*'] }, (d) => errors.push({ url: d.url, err: d.error }))

  await win.loadURL('http://127.0.0.1:' + port + '/')
  await new Promise((r) => setTimeout(r, 7000))

  console.log('ALL_COMPLETED:', JSON.stringify(done))
  console.log('ALL_ERRORS:', JSON.stringify(errors))
  const blocked = errors.filter((e) => e.err && String(e.err).toUpperCase().includes('BLOCKED_BY_CLIENT'))
  const exampleBlocked = blocked.some((b) => b.url.includes('example.com'))
  const adBlocked = blocked.some((b) => b.url.includes('doubleclick.net') || b.url.includes('adsrvr.org'))
  console.log('RESULT:', adBlocked && !exampleBlocked ? 'ADBLOCK_OK' : 'ADBLOCK_FAIL')
  server.close()
  app.exit(adBlocked && !exampleBlocked ? 0 : 1)
})
