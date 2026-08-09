const { app, safeStorage } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')

const PROFILE = path.join(os.tmpdir(), 'nixer-db-test-profile')
fs.rmSync(PROFILE, { recursive: true, force: true })
app.setPath('userData', PROFILE)
process.env.NIXER_USER_DATA = PROFILE

let store = require('./store')

function reloadStore() {
  delete require.cache[require.resolve('./store')]
  delete require.cache[require.resolve('./db')]
  store = require('./store')
}

app.whenReady().then(async () => {
  // --- Fase 1: escribir datos ---
  store.addBookmark({ url: 'https://ejemplo.com', title: 'Ejemplo' })
  store.addHistory({ url: 'https://historia.com', title: 'Historia' })
  store.setSettings({ aiApiKey: 'sk-secreto-ia', autofillProfile: { name: 'Ana García', email: 'ana@test.com', zip: '28001' } })
  store.setSettings({ blockAds: false, minimizeToTray: false, showBookmarksBar: false, tabMinWidth: 150, defaultZoom: 1, aiTemperature: 0.7, customSearchEngines: [{ id: 'custom-1', name: 'MiMotor', tpl: 'https://x.com/?q={q}' }] })
  store.addPassword({ origin: 'https://banco.com', username: 'ana', password: 'clave-super-secreta' })
  store.addReadingItem({ title: 'Articulo', url: 'https://art.com', text: 'contenido privado del articulo' })
  store.saveWorkspace('Trabajo', [{ url: 'https://a.com', title: 'A' }])
  store.setTabGroups({ g1: { name: 'Grupo', color: 'blue' } })
  store.addSearch('consulta reciente')
  store.addExtension({ id: 'ext1', name: 'MiExt', contentScripts: [] })

  // "Reinicio": volver a cargar el store desde la DB
  reloadStore()

  // --- Fase 2: verificar que persistió ---
  const bm = store.listBookmarks()
  const hist = store.searchHistory('historia')
  const pw = store.listPasswords()
  const rl = store.listReadingList()
  const ws = store.listWorkspaces()
  const tg = store.tabGroups()
  const rs = store.recentSearches()
  const ext = store.listExtensions()
  const s = store.settings()

  const checks = {}
  checks.bookmark = bm.length === 1 && bm[0].url === 'https://ejemplo.com'
  checks.history = hist.length === 1
  checks.password = pw.length === 1 && pw[0].password === 'clave-super-secreta' && pw[0].username === 'ana'
  checks.aiKey = s.aiApiKey === 'sk-secreto-ia' || store.decryptSecret(s.aiApiKey) === 'sk-secreto-ia'
  checks.profile = store.decryptProfile(s.autofillProfile).email === 'ana@test.com'
  checks.reading = rl.length === 1 && rl[0].text === 'contenido privado del articulo'
  checks.workspace = ws.length === 1 && ws[0].name === 'Trabajo'
  checks.groups = tg.g1 && tg.g1.name === 'Grupo'
  checks.recent = rs.includes('consulta reciente')
  checks.extension = ext.length === 1 && ext[0].id === 'ext1'

  // Round-trip tipado: los booleanos/numéricos/arrays deben recuperar su tipo real
  checks.blockAdsOff = s.blockAds === false
  checks.minimizeToTrayOff = s.minimizeToTray === false
  checks.showBookmarksBarOff = s.showBookmarksBar === false
  checks.tabMinWidthNum = s.tabMinWidth === 150
  checks.defaultZoomNum = s.defaultZoom === 1
  checks.temperatureNum = s.aiTemperature === 0.7
  checks.customEnginesArr = Array.isArray(s.customSearchEngines) && s.customSearchEngines[0] && s.customSearchEngines[0].id === 'custom-1'

  // --- Fase 3: verificar que NO hay texto plano sensible en la DB ---
  const dbFile = path.join(PROFILE, 'nixer.db')
  let raw = ''
  try { raw = fs.readFileSync(dbFile, 'utf8') } catch {}
  checks.noPlainPassword = !raw.includes('clave-super-secreta')
  checks.noPlainAiKey = !raw.includes('sk-secreto-ia')
  checks.noPlainProfile = !raw.includes('Ana García')
  checks.noPlainReading = !raw.includes('contenido privado')
  checks.dbExists = fs.existsSync(dbFile)

  const allOk = Object.values(checks).every(Boolean)
  console.log('DB_CHECK:', JSON.stringify(checks))
  console.log('RESULT:', allOk ? 'DB_OK' : 'DB_FAIL')
  app.exit(allOk ? 0 : 1)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 20000)
