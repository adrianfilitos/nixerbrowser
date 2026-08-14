const { app, net } = require('electron')
const fs = require('fs')
const path = require('path')
const filters = require('./filters')

const BLOCKLIST_URL = 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts'
const YOYO_URL = 'https://pgl.yoyo.org/adservers/serverlist.php?hostformat=hosts&mimetype=plaintext'
const OPENPHISH_URL = 'https://openphish.com/feed.txt'
const EASYLIST_URL = 'https://easylist.to/easylist/easylist.txt'
const EASYPRIVACY_URL = 'https://easylist.to/easylist/easyprivacy.txt'

// Patrones de anuncios / ad-tech (se aplican a subrecursos, no a la página principal)
const AD_PATTERNS = [
  '/ads/', '/ads?', '/adserver', 'adserver.', 'adsystem', '/pagead/', 'googleadservices',
  'googlesyndication', 'doubleclick', 'adservice.', 'adnxs', 'adsrvr.', 'criteo.', 'taboola.',
  'outbrain.', 'pubmatic', 'openx.', 'rubicon', 'casalemedia', 'smartadserver', 'moatads',
  'quantserve', 'scorecardresearch', 'adform.', 'adroll', 'amazon-adsystem', 'safeframe',
  '/adclick', '/sponsored', 'advertising.', 'yieldmo', 'zedo.', 'demdex', 'rlcdn', 'tapad.',
  'bluekai', 'exelator', 'contextweb', 'sharethrough', 'spotxchange', 'gumgum', '33across',
  'bidswitch', 'tribalfusion', '/advert', 'ad-serve', 'adtech', 'undertone',
  'yieldlab', 'medianet', 'trackad', 'adx-', '/aniview', 'adpushup', 'anyclip', 'adthrive',
  'mediavine', 'ezoic', 'tapresearch', 'prebid', 'pubnative', 'rtbhouse', 'smadex', 'sovrn',
  'indexexchange', 'lijit', 'zemanta', 'improvedigital', 'rhythmone', 'conversantmedia',
  'beachfront', 'emxdgt', 'triplelift', 'ucfunnel', 'verizonmedia', 'yieldbird', 'kixer',
  'media.net', 'nudatasecurity', 'pavlovads', 'plista', 'stackadapt', 'startappservice',
  'sulvo', 'unrulymedia', 'videoamp', 'usemax', 'brightcom', 'onetag', 'orcasrv', 'tidaltv',
  'adserv.', 'adserver', 'adv.', 'pixel.ads', 'adserving',
]

// Patrones de rastreo / telemetría / analítica.
// Solo tokens específicos de redes conocidas: los substrings genéricos de ruta
// (/track, /event, /beacon, /collect…) rompían APIs y logins legítimos.
const TRACKER_PATTERNS = [
  '/pageview',
  'statcounter', 'hotjar', 'optimizely', 'mouseflow', 'fullstory', 'clarity.ms',
  'segment.io', 'amplitude', 'mixpanel', 'matomo', 'piwik', 'bugsnag', 'sentry.io',
  'newrelic', 'appdynamics',
  'facebook.com/tr', 'connect.facebook.net', 'static.ads-twitter.com',
  'analytics.twitter.com', 'ads-twitter.com', 'app-measurement.com',
  'crashlytics', 'doubleclick.net/pagead', 'gtm.js', 'gtag/js',
  'google-analytics.com/analytics.js', 'googletagmanager.com/gtm',
  'googletagmanager.com/gtag', 'google-analytics.com/collect', '/o/ads',
]

// Dominios embebidos: anuncios + rastreo + social/telemetría (host exacto / subdominios)
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
  // analítica y telemetría
  'statcounter.com', 'mouseflow.com', 'fullstory.com', 'segment.com', 'segment.io',
  'amplitude.com', 'mixpanel.com', 'matomo.org', 'piwik.pro', 'bugsnag.com',
  'sentry.io', 'newrelic.com', 'clarity.ms', 'app-measurement.com', 'firebaseio.com',
  'firebaselogging.googleapis.com', 'inappmessaging.googleapis.com', 'appspot.com',
  'crashlytics.com', 'instana.com', 'dynatrace.com', 'datadoghq.com', 'nr-data.net',
  'browser.sentry-cdn.com', 'perfops.net', 'speedcurve.com', 'akamai.net/mPulse',
  // social / widgets de seguimiento
  'connect.facebook.net', 'static.ads-twitter.com', 'analytics.twitter.com',
  'ads-twitter.com', 'platform.twitter.com', 'www.googletagmanager.com',
  'graph.facebook.com', 'facebook.net',
]

const BLOCK_TYPES = new Set(['script', 'image', 'xhr', 'fetch', 'media', 'sub_frame', 'websocket', 'beacon', 'font', 'object', 'ping'])

let domains = new Set()
let suffixes = new Set()
let cache = { ts: 0, domains: [] }
let loaded = false
const blockedCounts = new Map()
let totalBlocked = 0
const recent = []

function logFile() {
  return path.join(app.getPath('userData'), 'adblock.log')
}

function logBlock(url, type, pageOrigin) {
  recent.unshift({ ts: Date.now(), url, type, pageOrigin: pageOrigin || '' })
  if (recent.length > 80) recent.pop()
  totalBlocked++
  try {
    fs.appendFileSync(logFile(), new Date().toISOString() + ' [' + type + '] ' + url + '\n')
  } catch {}
}

function ensureLoaded() {
  if (loaded) return
  loaded = true
  loadCache()
  loadFiltersCache()
  addList(EMBEDDED)
}

function addList(list) {
  for (const d of list) {
    const h = String(d).trim().toLowerCase().replace(/^www\./, '').replace(/^https?:\/\//, '').split('/')[0]
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

function fetchUrlHosts(url) {
  return net.fetch(url, { cache: 'no-store' }).then((res) => {
    if (!res.ok) throw new Error('http ' + res.status)
    return res.text()
  }).then((text) => {
    const list = []
    for (const line of text.split(/\r?\n/)) {
      const l = line.trim()
      if (!l || !/^https?:\/\//.test(l)) continue
      try { list.push(new URL(l).hostname) } catch {}
    }
    return list
  })
}

function filtersCacheFile() {
  return path.join(app.getPath('userData'), 'filters-cache.json')
}

function loadFiltersCache() {
  try {
    const data = JSON.parse(fs.readFileSync(filtersCacheFile(), 'utf8'))
    if (data && data.text) {
      filters.parseList(data.text)
      filters.activate()
    }
  } catch {}
}

function saveFiltersCache(text) {
  try {
    fs.writeFileSync(filtersCacheFile(), JSON.stringify({ ts: Date.now(), text }))
  } catch {}
}

function refresh() {
  Promise.all([
    fetchHosts(BLOCKLIST_URL),
    fetchHosts(YOYO_URL).catch(() => []),
    fetchUrlHosts(OPENPHISH_URL).catch(() => []),
    net.fetch(EASYLIST_URL, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
    net.fetch(EASYPRIVACY_URL, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
  ])
    .then(([a, b, c, easy, priv]) => {
      const list = [...a, ...b, ...c]
      domains = new Set()
      suffixes = new Set()
      addList(list)
      addList(EMBEDDED)
      saveCache(list)
      const text = easy + '\n' + priv
      filters.parseList(text)
      filters.activate()
      saveFiltersCache(text)
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

function urlMatches(patterns, url) {
  const u = url.toLowerCase()
  for (const r of patterns) {
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
  const c = blockedCounts.get(origin) || { ads: 0, scripts: 0, trackers: 0 }
  c[type] = (c[type] || 0) + 1
  blockedCounts.set(origin, c)
}

function pageHostOf(initiator) {
  try {
    return initiator ? new URL(initiator).hostname.toLowerCase() : ''
  } catch {
    return ''
  }
}

function pageOriginOf(initiator) {
  try {
    return initiator ? new URL(initiator).origin : ''
  } catch {
    return ''
  }
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
      const origin = originOf(details.url)
      const type = details.resourceType || 'other'
      const pageHost = pageHostOf(details.initiator) || pageHostOf(details.referrer)
      const pageOrigin = pageOriginOf(details.initiator) || pageOriginOf(details.referrer) || origin

      if (st.blockAds) {
        // 0) Filtros EasyList/EasyPrivacy (reglas de red con excepciones)
        const fm = filters.matches(details.url, type, pageHost)
        if (fm) {
          bump(pageOrigin, type === 'script' ? 'scripts' : 'ads')
          logBlock(details.url, 'filtro', pageOrigin)
          return callback({ cancel: true })
        }
      }

      // 1) Host en la lista (bloquea TODO, incluida la página principal)
      if (st.blockAds && isBlocked(host)) {
        bump(pageOrigin, 'ads')
        logBlock(details.url, 'anuncio', pageOrigin)
        return callback({ cancel: true })
      }

      // 2) Patrones de rastreo en subrecursos
      if ((st.blockAds || st.blockTrackers) && type !== 'main_frame' && BLOCK_TYPES.has(type) && urlMatches(TRACKER_PATTERNS, details.url)) {
        bump(pageOrigin, 'trackers')
        logBlock(details.url, 'rastreador', pageOrigin)
        return callback({ cancel: true })
      }

      // 3) Patrones de anuncios en subrecursos
      if (st.blockAds && type !== 'main_frame' && BLOCK_TYPES.has(type) && urlMatches(AD_PATTERNS, details.url)) {
        bump(pageOrigin, type === 'script' ? 'scripts' : 'ads')
        logBlock(details.url, 'anuncio', pageOrigin)
        return callback({ cancel: true })
      }

      // 4) Bloqueo de scripts (ajuste manual)
      if (st.blockScripts && type === 'script') {
        bump(pageOrigin, 'scripts')
        logBlock(details.url, 'script', pageOrigin)
        return callback({ cancel: true })
      }

      // 5) Bloqueo de imágenes (ajuste "mostrar imágenes")
      if (st.blockImages && type === 'image') {
        bump(pageOrigin, 'ads')
        logBlock(details.url, 'imagen', pageOrigin)
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
    if (st.sendDnt) {
      let hh = ''
      try { hh = new URL(details.url).hostname.toLowerCase() } catch {}
      if (hh !== 'google.com' && !hh.endsWith('.google.com')) h['DNT'] = '1'
    }
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
  const byOrigin = Object.fromEntries(blockedCounts)
  let ads = 0
  let scripts = 0
  let trackers = 0
  for (const c of blockedCounts.values()) {
    ads += c.ads || 0
    scripts += c.scripts || 0
    trackers += c.trackers || 0
  }
  return {
    count: domains.size,
    filters: filters.stats(),
    updated: cache.ts,
    total: totalBlocked,
    ads,
    scripts,
    trackers,
    blocked: byOrigin,
  }
}

function cosmeticCss(host) {
  try {
    const sels = filters.cosmeticFor(host)
    if (!sels.length) return ''
    return sels.map((s) => s + '{display:none !important}').join('\n')
  } catch {
    return ''
  }
}

function recentLog() {
  return recent.slice()
}

module.exports = { init, refresh, stats, recentLog, cosmeticCss }
