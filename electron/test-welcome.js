const { app, BrowserWindow } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-welcome-test')
process.env.NIXER_SKIP_AUTOCREATE = '1'
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const store = require('./store')
const profiles = require('./profiles')
const delay = (ms) => new Promise((r) => setTimeout(r, ms))
app.whenReady().then(async () => {
  const results = {}
  let onb = null
  for (let i = 0; i < 25 && !onb; i++) {
    onb = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('onboarding.html'))
    if (!onb) await delay(200)
  }
  results.onboardingOpen = !!onb

  const rec = profiles.createLocal('Ana', '#e05252')
  results.hasActive = profiles.hasActive()
  results.profileCreated = store.settings().profileCreated === true
  results.profileName = store.settings().profileName === 'Ana'

  // Simular un perfil ANTIGUO (creado antes del flag) y verificar que init() lo migra.
  store.setSettings({ profileCreated: false, profileName: '' })
  profiles.init()
  results.migrated = store.settings().profileCreated === true && store.settings().profileName === 'Ana'

  console.log('WELC:', JSON.stringify(results))
  const ok = results.onboardingOpen && results.hasActive && results.profileCreated && results.profileName && results.migrated
  console.log('RESULT:', ok ? 'WELC_OK' : 'WELC_FAIL')
  app.exit(ok ? 0 : 1)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 60000)
