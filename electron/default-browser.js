const path = require('path')
const crypto = require('crypto')
const { execFile } = require('child_process')

function regAdd(args) {
  return new Promise((resolve) => {
    execFile('reg', ['add', ...args, '/f'], { windowsHide: true }, (err) => resolve(!err))
  })
}

async function registerAsDefaultBrowser() {
  const exe = process.execPath
  const quoted = '"' + exe + '" "%1"'
  const base = 'HKCU\\Software\\Clients\\StartMenuInternet\\NixerBrowser'
  const steps = [
    ['HKCU\\Software\\RegisteredApplications', '/v', 'Nixer Browser', '/t', 'REG_SZ', '/d', 'Software\\Clients\\StartMenuInternet\\NixerBrowser\\Capabilities'],
    [base + '\\Capabilities', '/ve', '/d', 'Nixer Browser'],
    [base + '\\Capabilities', '/v', 'ApplicationName', '/t', 'REG_SZ', '/d', 'Nixer Browser'],
    [base + '\\Capabilities', '/v', 'ApplicationDescription', '/t', 'REG_SZ', '/d', 'Navegador basado en Chromium con interfaz en React'],
    [base + '\\Capabilities', '/v', 'ApplicationIcon', '/t', 'REG_SZ', '/d', '"' + exe + '",0'],
    [base + '\\Capabilities\\URLAssociations', '/v', 'http', '/t', 'REG_SZ', '/d', 'NixerBrowser.http'],
    [base + '\\Capabilities\\URLAssociations', '/v', 'https', '/t', 'REG_SZ', '/d', 'NixerBrowser.https'],
    [base + '\\Capabilities\\URLAssociations', '/v', 'mailto', '/t', 'REG_SZ', '/d', 'NixerBrowser.mailto'],
    [base + '\\Capabilities\\Application', '/v', 'ApplicationName', '/t', 'REG_SZ', '/d', 'Nixer Browser'],
    [base + '\\Capabilities\\Application', '/v', 'ApplicationDescription', '/t', 'REG_SZ', '/d', 'Navegador basado en Chromium con interfaz en React'],
    [base + '\\Capabilities\\Application', '/v', 'AppUserModelID', '/t', 'REG_SZ', '/d', 'com.nixer.browser'],
    [base + '\\Capabilities\\DefaultIcon', '/ve', '/d', '"' + exe + '",0'],
    [base + '\\shell\\open\\command', '/ve', '/d', '"' + exe + '"'],
    [base + '\\DefaultIcon', '/ve', '/d', '"' + exe + '",0'],
    ['HKCU\\Software\\Classes\\NixerBrowser.http\\shell\\open\\command', '/ve', '/d', quoted],
    ['HKCU\\Software\\Classes\\NixerBrowser.https\\shell\\open\\command', '/ve', '/d', quoted],
    ['HKCU\\Software\\Classes\\NixerBrowser.mailto\\shell\\open\\command', '/ve', '/d', quoted],
    ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\Nixer Browser.exe', '/ve', '/d', exe],
  ]
  const results = []
  for (const s of steps) results.push(await regAdd(s))
  return results.every(Boolean)
}

function isHttpDefault() {
  return new Promise((resolve) => {
    execFile('reg', ['query', 'HKCU\\Software\\Classes\\http\\shell\\open\\command', '/ve'], { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve(false)
      const name = path.basename(process.execPath).toLowerCase()
      const lower = String(stdout).toLowerCase()
      resolve(lower.includes(name) || lower.includes('nixerbrowser.http'))
    })
  })
}

async function forceProtocolAssociations() {
  const exe = process.execPath
  const quoted = '"' + exe + '" "%1"'
  const steps = [
    ['HKCU\\Software\\Classes\\http\\shell\\open\\command', '/ve', '/d', quoted],
    ['HKCU\\Software\\Classes\\https\\shell\\open\\command', '/ve', '/d', quoted],
    ['HKCU\\Software\\Classes\\ftp\\shell\\open\\command', '/ve', '/d', quoted],
    ['HKCU\\Software\\Classes\\mailto\\shell\\open\\command', '/ve', '/d', quoted],
  ]
  const results = []
  for (const s of steps) results.push(await regAdd(s))
  return results.every(Boolean)
}

function userChoiceHash(progId, sid) {
  const keyBytes = Buffer.from('A4A120A58017F64FBD18167343C5AF16', 'hex')
  const msg = Buffer.from(progId + sid, 'utf16le')
  return crypto.createHmac('sha256', keyBytes).update(msg).digest('base64')
}

function currentSid() {
  return new Promise((resolve) => {
    execFile('whoami', ['/user'], { windowsHide: true }, (err, stdout) => {
      if (err || !stdout) return resolve(null)
      const m = /(S-\d+(-\d+)+)/.exec(stdout)
      resolve(m ? m[1] : null)
    })
  })
}

async function writeUserChoice() {
  const sid = await currentSid()
  if (!sid) return false
  const pairs = [
    ['http', 'NixerBrowser.http'],
    ['https', 'NixerBrowser.https'],
    ['mailto', 'NixerBrowser.mailto'],
  ]
  let allOk = true
  for (const [proto, progId] of pairs) {
    const key = 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\' + proto + '\\UserChoice'
    const ok1 = await regAdd([key, '/v', 'ProgId', '/t', 'REG_SZ', '/d', progId])
    const ok2 = await regAdd([key, '/v', 'Hash', '/t', 'REG_SZ', '/d', userChoiceHash(progId, sid)])
    allOk = allOk && ok1 && ok2
  }
  return allOk
}

module.exports = {
  regAdd,
  registerAsDefaultBrowser,
  isHttpDefault,
  forceProtocolAssociations,
  writeUserChoice,
}
