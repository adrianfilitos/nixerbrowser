const { app } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const http = require('http')
const MOCK_PORT = 18998
process.env.NIXER_USER_DATA = path.join(os.tmpdir(), 'nixer-oauth-test')
process.env.NIXER_SKIP_AUTOCREATE = '1'
process.env.NIXER_SUPABASE_URL = 'http://127.0.0.1:' + MOCK_PORT
process.env.NIXER_SUPABASE_ANON_KEY = 'anon-oauth'
fs.rmSync(process.env.NIXER_USER_DATA, { recursive: true, force: true })
require('./main')
const profiles = require('./profiles')

const jwt = (sub) => {
  const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const p = Buffer.from(JSON.stringify({ sub })).toString('base64url')
  return h + '.' + p + '.sig'
}

app.whenReady().then(async () => {
  const results = {}
  const seen = {}
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const send = (code, obj) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)) }
      try {
        if (req.url.startsWith('/auth/v1/authorize')) {
          const u = new URL(req.url, 'http://x')
          seen.challenge = u.searchParams.get('code_challenge')
          seen.method = u.searchParams.get('code_challenge_method')
          seen.redirect_to = u.searchParams.get('redirect_to')
          res.statusCode = 302
          res.setHeader('Location', seen.redirect_to + '?code=TESTCODE&state=st')
          return res.end()
        }
        if (req.url.startsWith('/auth/v1/token')) {
          const b = JSON.parse(body)
          seen.code = b.auth_code
          seen.code_verifier = b.code_verifier
          if (b.auth_code !== 'TESTCODE' || !b.code_verifier) return send(400, { message: 'bad code/verifier' })
          return send(200, { access_token: jwt('u-oauth'), refresh_token: 'rt', user: { id: 'u-oauth', email: 'oauth@test.com', user_metadata: { avatar_url: 'https://x/a.png' } } })
        }
        return send(404, { message: 'nf' })
      } catch (e) { send(500, { message: String(e && e.message) }) }
    })
  })
  await new Promise((r) => server.listen(MOCK_PORT, '127.0.0.1', r))
  await new Promise((r) => setTimeout(r, 1200))

  await profiles.loginWithProvider('google', false)
  const cur = profiles.current()
  results.type = cur ? cur.type : null
  results.email = cur ? cur.email : ''
  results.avatarSource = cur ? cur.avatarSource : ''
  results.avatar = cur ? cur.avatar : ''
  results.code = seen.code
  results.codeVerifierSent = !!seen.code_verifier
  results.challengeSent = !!seen.challenge && seen.method === 'S256'

  server.close()
  console.log('OAUTH:', JSON.stringify(results))
  const ok = results.type === 'cloud' && results.email === 'oauth@test.com' && results.avatarSource === 'provider' && results.avatar && results.code === 'TESTCODE' && results.codeVerifierSent && results.challengeSent
  console.log('RESULT:', ok ? 'OAUTH_OK' : 'OAUTH_FAIL')
  app.exit(ok ? 0 : 1)
}).catch((e) => { console.log('ERR', e && e.stack); app.exit(2) })
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 90000)
