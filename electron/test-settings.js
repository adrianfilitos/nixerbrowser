const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-settings-profile')
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })

require('./main')

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  let normal = null
  for (let i = 0; i < 20 && !normal; i++) {
    const ws = BrowserWindow.getAllWindows()
    if (ws.length) normal = ws[0]
    else await delay(500)
  }
  const ui = normal.webContents
  const errs = []
  ui.on('console-message', (_e, level, message) => { if (level >= 3) errs.push(String(message)) })

  await delay(2500)
  for (let i = 0; i < 10; i++) {
    const has = await ui.executeJavaScript(`!!document.querySelector('webview.active')`).catch(() => false)
    if (has) break
    await delay(500)
  }
  await ui.executeJavaScript(`(() => { const wv = document.querySelector('webview.active'); if (wv) wv.loadURL('nixer://settings'); return true })()`)
  await delay(2500)

  const r = await Promise.race([
    ui.executeJavaScript(`(async () => {
      const wv = document.querySelector('webview.active')
      const out = await wv.executeJavaScript(\`(function () {
        const ids = ['theme','tabShape','tabStripPosition','tabMinWidth','animations','showHomeButton','showDownloadsButton','showExtensionsButton','showIncognitoBadge','showMenuButton','lastTabCloseAction','openLinksInBackground','confirmCloseMultiple','newtabWallpaper','greeting','showClock','showSearch','showRecent','downloadPath','askDownloadLocation','showDownloadNotifications','openFolderWhenDone','pageFontSize','autoplayPolicy','defaultZoom','autofillEnabled','homePage','blockAds','blockCookies','blockScripts','httpsUpgrade','sendDnt','safeBrowsing','doh','offerPasswordSave','blockPopups','launchAtStartup','minimizeToTray','startMinimized','memorySaver','hardwareAcceleration','gpuRasterization','reduceMotion','highContrast','uiFontScale','toolbarFontSize','aiProvider','aiBaseUrl','aiApiKey','aiModel','aiTemperature','aiMaxTokens']
        const missing = ids.filter(function (id) { return !document.getElementById(id) })
        const sections = document.querySelectorAll('main section').length
        const nav = document.querySelectorAll('#nav button').length
        return { title: document.title, sections: sections, nav: nav, missing: missing }
      })()\`)
      return out
    })()`),
    new Promise((r) => setTimeout(() => r('TIMEOUT'), 10000)),
  ])

  console.log('SETTINGS:', JSON.stringify({ r, errs }))
  const ok = typeof r === 'object' && r.sections >= 14 && r.nav >= 14 && r.missing.length === 0 && errs.length === 0
  console.log('RESULT:', ok ? 'SETTINGS_OK' : 'SETTINGS_FAIL')
  normal.close()
  setTimeout(() => app.exit(ok ? 0 : 1), 300)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 60000)
