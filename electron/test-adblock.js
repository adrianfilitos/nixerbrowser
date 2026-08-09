const { app, BrowserWindow, session } = require('electron')
const http = require('http')
const adblock = require('./adblock')

app.whenReady().then(async () => {
  adblock.init(session.defaultSession, () => ({ blockAds: true, blockScripts: true, httpsUpgrade: false }))

  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html')
    res.end(
      '<html><body>' +
        '<img src="https://example.com/ok.png">' +
        '<img src="https://doubleclick.net/b.png">' +
        '<img src="https://adsrvr.org/c.png">' +
        '<script src="https://cdn.example.com/adserver/ads.js"></script>' +
        '<img src="https://tracker.example.com/collect?x=1">' +
        '<iframe src="https://taboola.com/widget"></iframe>' +
        '</body></html>'
    )
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const port = server.address().port

  const win = new BrowserWindow({ width: 800, height: 600, show: false, webPreferences: { sandbox: true } })
  const done = []
  const errors = []
  session.defaultSession.webRequest.onCompleted({ urls: ['*://*/*'] }, (d) => done.push(d.url))
  session.defaultSession.webRequest.onErrorOccurred({ urls: ['*://*/*'] }, (d) => errors.push({ url: d.url, err: d.error }))

  await win.loadURL('http://127.0.0.1:' + port + '/')
  await new Promise((r) => setTimeout(r, 8000))

  const blocked = errors.filter((e) => e.err && String(e.err).toUpperCase().includes('BLOCKED_BY_CLIENT')).map((e) => e.url)
  const stats = adblock.stats()

  console.log('ALL_ERRORS:', JSON.stringify(errors))
  console.log('STATS:', JSON.stringify(stats))

  const hostBlocked = blocked.some((u) => u.includes('doubleclick.net') || u.includes('adsrvr.org'))
  const patternScriptBlocked = blocked.some((u) => u.includes('/adserver/ads.js'))
  const patternTrackerBlocked = blocked.some((u) => u.includes('/collect?x=1'))
  const patternFrameBlocked = blocked.some((u) => u.includes('taboola.com/widget'))
  const okNotBlocked = !blocked.some((u) => u.includes('example.com/ok.png'))

  const ok = hostBlocked && patternScriptBlocked && patternTrackerBlocked && patternFrameBlocked && okNotBlocked && stats.total > 0 && (stats.ads > 0 || stats.trackers > 0)
  console.log('RESULT:', ok ? 'ADBLOCK_OK' : 'ADBLOCK_FAIL')
  server.close()
  app.exit(ok ? 0 : 1)
})
