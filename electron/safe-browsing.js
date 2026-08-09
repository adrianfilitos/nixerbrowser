const { net } = require('electron')
const store = require('./store')
const { hostOf } = require('./util')

const SB_CACHE = new Map() // host -> { bad, ts }
const SB_TTL = 6 * 3600 * 1000

function isCachedBad(url) {
  const host = hostOf(url)
  const cached = host && SB_CACHE.get(host)
  return !!(cached && cached.bad)
}

function clearHost(host) {
  if (host) SB_CACHE.delete(host)
  return true
}

async function checkUrl(url, wc) {
  const host = hostOf(url)
  if (!host || !wc || wc.isDestroyed()) return
  const cached = SB_CACHE.get(host)
  if (cached && Date.now() - cached.ts < SB_TTL) {
    if (cached.bad) { try { wc.loadURL('nixer://warning?url=' + encodeURIComponent(url)) } catch {} }
    return
  }
  SB_CACHE.set(host, { bad: false, ts: Date.now() })
  try {
    const res = await net.fetch('https://urlhaus-api.abuse.ch/v1/url/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'url=' + encodeURIComponent(url),
      signal: AbortSignal.timeout(7000),
    })
    const json = await res.json().catch(() => null)
    const bad = !!(json && (json.query_status === 'online' || json.query_status === 'offline'))
    SB_CACHE.set(host, { bad, ts: Date.now() })
    if (bad && !wc.isDestroyed()) {
      try { wc.loadURL('nixer://warning?url=' + encodeURIComponent(url)) } catch {}
    }
  } catch {}
}

const ALLOWED_NAV = ['http:', 'https:', 'nixer:', 'chrome-extension:', 'about:', 'data:']

function attachWebviewGuards(wc) {
  wc.on('did-start-navigation', (_e, url, _isInPlace, isMainFrame) => {
    if (isMainFrame && url && /^https?:/.test(url) && store.settings().safeBrowsing !== false) checkUrl(url, wc)
  })
  wc.on('will-navigate', (e, url) => {
    let proto = ''
    try { proto = new URL(url).protocol } catch { e.preventDefault(); return }
    if (!ALLOWED_NAV.includes(proto)) {
      e.preventDefault()
      return
    }
    if (store.settings().safeBrowsing === false) return
    if (isCachedBad(url)) {
      e.preventDefault()
      try { wc.loadURL('nixer://warning?url=' + encodeURIComponent(url)) } catch {}
    }
  })
}

module.exports = { checkUrl, clearHost, isCachedBad, attachWebviewGuards }
