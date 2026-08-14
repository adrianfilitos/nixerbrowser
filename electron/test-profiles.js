const { app } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const http = require('http')
const MOCK_PORT = 18999
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-profiles-test')
process.env.NIXER_SKIP_AUTOCREATE = '1'
process.env.NIXER_SUPABASE_URL = 'http://127.0.0.1:' + MOCK_PORT
process.env.NIXER_SUPABASE_ANON_KEY = 'anon-test'
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const store = require('./store')
const profiles = require('./profiles')

const jwt = (sub) => {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const p = Buffer.from(JSON.stringify({ sub })).toString('base64url')
  return h + '.' + p + '.sig'
}

app.whenReady().then(async () => {
  const results = {}
  await new Promise((r) => setTimeout(r, 1200))

  // --- Perfiles locales: aislamiento ---
  results.startHasActive = profiles.hasActive()
  const ana = profiles.createLocal('Ana', '#e05252')
  const anaId = ana.id
  results.anaActive = profiles.current().name === 'Ana'
  results.anaDirIsolated = store.getDataDir().includes('profiles' + path.sep + anaId)
  store.addBookmark({ url: 'https://ana.example', title: 'De Ana' })
  const anaHas = store.listBookmarks().length === 1

  const bob = profiles.createLocal('Bob', '#3da26e')
  results.bobIsolated = store.listBookmarks().length === 0
  store.addBookmark({ url: 'https://bob.example', title: 'De Bob' })
  const bobHas = store.listBookmarks().length === 1

  profiles.switchTo(anaId)
  const backToAna = store.listBookmarks().some((b) => b.url === 'https://ana.example') && !store.listBookmarks().some((b) => b.url === 'https://bob.example')

  profiles.removeProfile(bob.id)
  results.profilesLeft = profiles.list().length === 1

  results.local = { startHasActive: results.startHasActive, anaActive: results.anaActive, anaDirIsolated: results.anaDirIsolated, anaHas, bobIsolated: results.bobIsolated, bobHas, backToAna, profilesLeft: results.profilesLeft }

  // --- Nube (mock Supabase) + sync ---
  const users = new Map()
  const syncData = new Map()
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const send = (code, obj) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)) }
      try {
        if (req.url.startsWith('/auth/v1/signup')) {
          const b = JSON.parse(body); users.set(b.email, { uid: 'u-' + b.email.replace(/[^a-z0-9]/gi, ''), password: b.password })
          return send(200, { user: { id: users.get(b.email).uid, email: b.email, user_metadata: { avatar_url: 'https://x/avatar.png' } } })
        }
        if (req.url.startsWith('/auth/v1/token')) {
          const b = JSON.parse(body); const u = users.get(b.email)
          if (!u || u.password !== b.password) return send(400, { message: 'invalid' })
          return send(200, { access_token: jwt(u.uid), refresh_token: 'rt', user: { id: u.uid, email: b.email, user_metadata: { avatar_url: 'https://x/avatar.png' } } })
        }
        if (req.url.startsWith('/rest/v1/sync_data')) {
          if (req.method === 'POST') {
            const rows = JSON.parse(body)
            for (const r of rows) { if (!syncData.has(r.user_id)) syncData.set(r.user_id, new Map()); syncData.get(r.user_id).set(r.key, r.payload) }
            return send(201, rows)
          }
          if (req.method === 'GET') {
            const m = req.url.match(/user_id=eq\.([^&]+)/); const uid = m ? m[1] : ''
            const map = syncData.get(uid) || new Map(); const out = []
            for (const [k, v] of map) out.push({ key: k, payload: v })
            return send(200, out)
          }
          return send(200, [])
        }
        return send(404, { message: 'nf' })
      } catch (e) { send(500, { message: String(e && e.message) }) }
    })
  })
  await new Promise((r) => server.listen(MOCK_PORT, '127.0.0.1', r))

  await profiles.signupCloud('ana@test.com', 'clave123')
  const cloud = profiles.current()
  results.cloudType = cloud.type
  results.cloudAvatar = cloud.avatarSource === 'provider' && !!cloud.avatar
  results.cloudProfileCreated = store.settings().profileCreated === true
  const cloudEmpty = store.listBookmarks().length === 0

  store.addBookmark({ url: 'https://cloud.example', title: 'Nube' })
  await profiles.syncNow()
  const uid = Array.from(users.values())[0].uid
  const pushed = syncData.has(uid) && syncData.get(uid).get('bookmarks') ? syncData.get(uid).get('bookmarks').map((b) => b.url) : []
  results.pushed = pushed.includes('https://cloud.example')

  await profiles.signoutCloud()
  profiles.createLocal('Tmp', '#000000')
  const tmpHasCloud = store.listBookmarks().some((b) => b.url === 'https://cloud.example')
  results.tmpIsolated = !tmpHasCloud

  await profiles.signinCloud('ana@test.com', 'clave123')
  const pulled = store.listBookmarks().map((b) => b.url)
  results.pulled = pulled.includes('https://cloud.example')

  // --- Adopción de datos al iniciar sesión desde un perfil local ---
  profiles.createLocal('Adopta', '#d99a2b')
  store.addBookmark({ url: 'https://adopt.example', title: 'A adoptar' })
  await profiles.signinCloud('ana@test.com', 'clave123', true) // adopt = true
  const adoptedList = store.listBookmarks().map((b) => b.url)
  results.adopted = adoptedList.includes('https://adopt.example') && adoptedList.includes('https://cloud.example')
  results.adoptedList = adoptedList
  await profiles.syncNow()
  const adoptedInCloud = syncData.get(uid) && syncData.get(uid).get('bookmarks') ? syncData.get(uid).get('bookmarks').map((b) => b.url) : []
  results.adoptedInCloud = adoptedInCloud.includes('https://adopt.example')

  results.cloud = { cloudType: results.cloudType, cloudAvatar: results.cloudAvatar, cloudProfileCreated: results.cloudProfileCreated, cloudEmpty, pushed: results.pushed, tmpIsolated: results.tmpIsolated, pulled: results.pulled, adopted: results.adopted, adoptedInCloud: results.adoptedInCloud }
  server.close()
  console.log('PRF:', JSON.stringify(results))
  const ok =
    results.local.startHasActive === false && results.local.anaActive && results.local.anaDirIsolated && results.local.anaHas &&
    results.local.bobIsolated && results.local.bobHas && results.local.backToAna && results.local.profilesLeft &&
    results.cloud.cloudType === 'cloud' && results.cloud.cloudAvatar && results.cloud.cloudProfileCreated && results.cloud.cloudEmpty && results.cloud.pushed && results.cloud.tmpIsolated && results.cloud.pulled &&
    results.cloud.adopted && results.cloud.adoptedInCloud
  console.log('RESULT:', ok ? 'PRF_OK' : 'PRF_FAIL')
  app.exit(ok ? 0 : 1)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 120000)
