const { app, net } = require('electron')
const fs = require('fs')
const path = require('path')

const BLOCKLIST_URL = 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts'
const YOYO_URL = 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=hosts&mimetype=plaintext'

const URL_RULES = [
  '/ads/', '/adserver', 'adserver.', 'adsystem', '/pagead/', 'googleadservices', 'googlesyndication',
  'doubleclick', 'adservice.', 'adnxs', 'adsrvr.', 'criteo.', 'taboola.', 'outbrain.', 'pubmatic',
  'openx.', 'rubicon', 'casalemedia', 'smartadserver', 'moatads', 'quantserve', 'scorecardresearch',
  'adform.', 'adroll', 'amazon-adsystem', 'safeframe', 'pixel.', '/pixel', '/beacon', '/impression',
  '/adclick', '/sponsored', 'advertising.', 'yieldmo', 'zedo.', 'demdex', 'rlcdn', 'tapad.',
  'bluekai', 'exelator', 'contextweb', 'sharethrough', 'spotxchange', 'gumgum', '33across',
  'bidswitch', 'tribalfusion', '/banner', '/tracking', '/advert', 'ad-serve', 'ads-', 'adtech',
  'undertone', 'yieldlab', 'medianet', '/doubleclick', 'trackad', 'adx-', '/aniview',
]

const EMBEDDED = [
  'doubleclick.net', 'googlesyndication.com', 'google-analytics.com', 'googletagmanager.com',
  'adservice.google.com', 'googleadservices.com', 'googletagservices.com', 'adsrvr.org',
  'adsymptotic.com', 'adnxs.com', 'adform.net', 'adroll.com', 'scorecardresearch.com',
  'quantserve.com', 'criteo.com', 'criteo.net', 'moatads.com', 'taboola.com', 'outbrain.com',
  'outbrainimg.com', 'teads.tv', 'pubmatic.com', 'openx.net', 'rubiconproject.com',
  'casalemedia.com', 'smartadserver.com', 'yieldmo.com', 'zedo.com', 'demdex.net',
  'rlcdn.com', 'tapad.com', 'hotjar.com', 'optimizely.com', '2mdn.net', 'admob.com',
  'doubleverify.com', 'turn.com', 'agkn.com', 'bluekai.com', 'exelator.com', '6sc.co',
  'adcolony.com', 'everesttech.net', 'flashtalking.com', 'mediamath.com', 'millennialmedia.com',
  'moat.com', 'nend.net', 'skimresources.com', 'tremorhub.com', 'aaxads.com', 'adscale.de',
  'adcloud.net', 'aniview.com', 'bidtellect.com', 'cpmstar.com', 'districtm.io', 'dyntrk.com',
  'kargo.com', 'lotame.com', 'revcontent.com', 'sekindo.com', 'smaato.net', 'sonobi.com',
  'undertone.com', 'yieldlab.net', 'adsafeprotected.com', 'indexww.com', 'lijit.com',
  'sovrn.com', 'zemanta.com', 'improvedigital.com', 'rhythmone.com', 'contextweb.com',
  'sharethrough.com', 'spotxchange.com', 'gumgum.com', '33across.com', 'adtech.de',
  'adtechus.com', 'bidswitch.net', 'advertising.com', 'tribalfusion.com', 'analytics.yahoo.com',
  'gemius.pl', 'intellitxt.com', 'segmnt.io', 'trafficjunky.net', 'adx1.com', 'bcxph.com',
  'conversantmedia.com', 'eyeviewdigital.com', 'nativeads.com', 'onestat.com', 'payclick.it',
  'petametrics.com', 'serving-sys.com', 'simpli.fi', 'trackingmarketplace.net',
  'admicro.vn', 'adspeed.net', 'adtelligent.com', 'beachfront.com', 'bidr.io',
  'brightcom.com', 'emxdgt.com', 'fwmrm.net', 'impact-ad.jp', 'onetag-sys.com',
  'orcasrv.com', 'safeframe.googlesyndication.com', 'tidaltv.com', 'triplelift.com',
  'ucfunnel.com', 'verizonmedia.com', 'yieldbird.com', 'find-searcher.com',
  'adpushup.com', 'ambientdigital.com', 'anyclip.com', 'ayads.co', 'exponential.com',
  'goto-websearch.com', 'imrworldwide.com', 'inskinmedia.com', 'ipredictive.com',
  'kixer.com', 'media.net', 'nudatasecurity.com', 'pavlovads.com', 'plista.com',
  'prebid.org', 'pubnative.net', 'quantcast.com', 'rtbhouse.com', 'skimlinks.com',
  'smadex.com', 'stackadapt.com', 'startappservice.com', 'sulvo.com', 'unrulymedia.com',
  'usemax.de', 'videoamp.com', 'vtracy.com', 'adthrive.com', 'mediavine.com',
  'ezoic.io', 'tapresearch.com', 'zetaglobal.com',
]

let domains = new Set()
let suffixes = new Set()
let cache = { ts: 0, domains: [] }
let loaded = false
const blockedCounts = new Map()
const recent = []

function logFile() {
  return path.join(app.getPath('userData'), 'adblock.log')
}

function logBlock(url, type) {
  recent.unshift({ ts: Date.now(), url, type })
  if (recent.length > 60) recent.pop()
  try {
    fs.appendFileSync(logFile(), new Date().toISOString() + ' [' + type + '] ' + url + '\n')
  } catch {}
}

function ensureLoaded() {
  if (loaded) return
  loaded = true
  loadCache()
  addList(EMBEDDED)
}

function addList(list) {
  for (const d of list) {
    const h = String(d).trim().toLowerCase().replace(/^www\./, '')
    if (!h || !h.includes('.') || h.startsWith('#') || h === 'localhost') continue
    domains.add(h)
    suffixes.add('.' + h)
  }
}

function loadCache() {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'blocklist.json'), 'utf8'))
    cache = { ts: data.ts || 0, domains: data.domains || [] }
    addList(cache.domains)
  } catch {}
}

function saveCache(list) {
  try {
    fs.writeFileSync(
      path.join(app.getPath('userData'), 'blocklist.json'),
      JSON.stringify({ ts: Date.now(), domains: list })
    )
  } catch {}
}

function fetchHosts(url) {
  return net.fetch(url, { cache: 'no-store' }).then((res) => {
    if (!res.ok) throw new Error('http ' + res.status)
    return res.text()
  }).then((text) => {
    const list = []
    for (const line of text.split(/\r?\n/)) {
      const l = line.trim()
      if (!l || l.startsWith('#')) continue
      const parts = l.split(/\s+/)
      if (parts.length >= 2 && /^(0\.0\.0\.0|127\.0\.0\.1|::)/.test(parts[0])) {
        const d = parts[1].toLowerCase().replace(/^www\./, '')
        if (d && d !== 'localhost' && d.includes('.')) list.push(d)
      }
    }
    return list
  })
}

function refresh() {
  Promise.all([
    fetchHosts(BLOCKLIST_URL),
    fetchHosts(YOYO_URL).catch(() => []),
  ])
    .then(([a, b]) => {
      const list = [...a, ...b]
      domains = new Set()
      suffixes = new Set()
      addList(list)
      addList(EMBEDDED)
      saveCache(list)
    })
    .catch(() => {})
}

function isBlocked(host) {
  if (domains.has(host)) return true
  for (let i = 0; i < host.length; i++) {
    if (host.charCodeAt(i) === 46) {
      if (suffixes.has(host.slice(i))) return true
    }
  }
  return false
}

function matchesUrlRules(url) {
  const u = url.toLowerCase()
  for (const r of URL_RULES) {
    if (u.includes(r)) return true
  }
  return false
}

function originOf(url) {
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}

function isThirdParty(details) {
  let url = null
  let init = null
  try { url = new URL(details.url) } catch {}
  try { init = details.initiator ? new URL(details.initiator) : null } catch {}
  if (!url || !init) return false
  return init.origin !== url.origin
}

function bump(origin, type) {
  if (!origin) return
  const c = blockedCounts.get(origin) || { ads: 0, scripts: 0 }
  c[type] = (c[type] || 0) + 1
  blockedCounts.set(origin, c)
}

function init(sessionRef, getState) {
  ensureLoaded()
  sessionRef.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    const st = getState(originOf(details.url))
    if (st.httpsUpgrade && details.url.startsWith('http://') && !/localhost|127\.0\.0\.1|\.local/.test(details.url)) {
      return callback({ redirectURL: 'https://' + details.url.slice(7) })
    }
    try {
      const url = new URL(details.url)
      const host = url.hostname.toLowerCase()
      if (st.blockAds && isBlocked(host)) {
        bump(originOf(details.url), 'ads')
        logBlock(details.url, 'anuncio')
        return callback({ cancel: true })
      }
      if (st.blockScripts && details.resourceType === 'script') {
        bump(originOf(details.url), 'scripts')
        logBlock(details.url, 'script')
        return callback({ cancel: true })
      }
    } catch {}
    callback({})
  })

  sessionRef.webRequest.onBeforeSendHeaders({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    const h = details.requestHeaders
    if (!h) return callback({})
    const st = getState(originOf(details.url))
    if (st.blockThirdPartyCookies && isThirdParty(details)) {
      for (const k of Object.keys(h)) {
        if (k.toLowerCase() === 'cookie') delete h[k]
      }
    }
    if (st.sendDnt) h['DNT'] = '1'
    callback({ requestHeaders: h })
  })

  sessionRef.webRequest.onHeadersReceived({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    const h = details.responseHeaders
    const st = getState(originOf(details.url))
    if (st.blockThirdPartyCookies && isThirdParty(details) && h) {
      for (const k of Object.keys(h)) {
        if (k.toLowerCase() === 'set-cookie') delete h[k]
      }
    }
    callback({ responseHeaders: h })
  })
}

function stats() {
  ensureLoaded()
  return {
    count: domains.size,
    updated: cache.ts,
    blocked: Object.fromEntries(blockedCounts),
  }
}

function recentLog() {
  return recent.slice()
}

module.exports = { init, refresh, stats, recentLog }