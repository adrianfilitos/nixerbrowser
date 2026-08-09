// Content-script main-world para neutralizar anuncios de YouTube/Music.
// Inyectado como <script> en la página; intercepta JSON.parse, fetch y XHR de
// /youtubei/player para eliminar adPlacements/playerAds antes de que el
// reproductor los procese, limpia ytInitialPlayerResponse/ytInitialData y
// elimina la UI de anuncios de forma periódica (autocurativo).

module.exports = `(function () {
  if (window.__nixerYtAd) return
  window.__nixerYtAd = true
  var AD_KEYS = ['adPlacements','playerAds','adSlots','adBreak','ad3p','adVideoId','adBreakParams','adSafeVastXml','attestationUrl','adWait','getAdBreakHeartbeatParams','adIsLive','adBlockingMarker']
  var AD_RENDERERS = ['adSlotRenderer','searchPyvAdRenderer','promotedSparklesWebRenderer','carouselAdRenderer','inFeedAdSlotRenderer','companionSlotRenderer','adDisplayedCompanionSlotsRenderer','adFeedbackReasonRenderer','adServiceRenderer','adBreakVideoStateRenderer']
  function isAdKey(k) {
    if (AD_KEYS.indexOf(k) !== -1) return true
    if (AD_RENDERERS.indexOf(k) !== -1) return true
    var l = String(k).toLowerCase()
    return l === 'ad' || (l.indexOf('ad') === 0 && (l.indexOf('slot') !== -1 || l.indexOf('placement') !== -1 || l.indexOf('break') !== -1 || l.indexOf('video') !== -1 && l.indexOf('advideo') === 0))
  }
  function isAdRendererNode(v) {
    return v && typeof v === 'object' && v.renderer && (isAdKey(v.renderer) || (v.renderer.adSlotRenderer))
  }
  function strip(o, depth) {
    if (!o || typeof o !== 'object' || depth > 16) return
    try {
      if (Array.isArray(o)) {
        for (var i = 0; i < o.length; i++) {
          var it = o[i]
          if (!it || typeof it !== 'object') continue
          if (isAdRendererNode(it)) { o.splice(i, 1); i--; continue }
          strip(it, depth + 1)
        }
        return
      }
      for (var k in o) {
        if (!Object.prototype.hasOwnProperty.call(o, k)) continue
        if (isAdKey(k)) { try { delete o[k] } catch (e) {} continue }
        var v = o[k]
        if (v && typeof v === 'object') {
          if (isAdRendererNode(v)) { try { delete o[k] } catch (e) {} continue }
          strip(v, depth + 1)
        }
      }
    } catch (e) {}
  }
  var origParse = JSON.parse
  JSON.parse = function (t) { var v = origParse(t); if (v && typeof v === 'object') strip(v, 0); return v }
  var origFetch = window.fetch
  if (origFetch) {
    window.fetch = function (input, init) {
      var url = (typeof input === 'string') ? input : (input && input.url) || ''
      var p = origFetch.apply(this, arguments)
      if (url.indexOf('/youtubei/') === -1) return p
      return p.then(function (res) {
        try {
          var ct = (res.headers.get('content-type') || '')
          if (ct.indexOf('json') === -1) return res
          return res.clone().json().then(function (j) {
            strip(j, 0)
            return new Response(JSON.stringify(j), { status: res.status, statusText: res.statusText, headers: res.headers })
          }).catch(function () { return res })
        } catch (e) { return res }
      })
    }
  }
  var origOpen = XMLHttpRequest.prototype.open
  var origSend = XMLHttpRequest.prototype.send
  XMLHttpRequest.prototype.open = function (m, u) { this.__nixu = String(u || ''); return origOpen.apply(this, arguments) }
  XMLHttpRequest.prototype.send = function () {
    var xhr = this
    try {
      this.addEventListener('load', function () {
        if (String(xhr.__nixu || '').indexOf('/youtubei/') === -1) return
        try {
          var t = xhr.responseText
          if (!t) return
          var j = origParse(t)
          strip(j, 0)
          var clean = JSON.stringify(j)
          try { Object.defineProperty(xhr, 'responseText', { get: function () { return clean }, configurable: true }) } catch (e) {}
          try { Object.defineProperty(xhr, 'response', { get: function () { return j }, configurable: true }) } catch (e) {}
        } catch (e) {}
      })
    } catch (e) {}
    return origSend.apply(this, arguments)
  }
  function cleanGlobals() {
    try { if (window.ytInitialPlayerResponse) strip(window.ytInitialPlayerResponse, 0) } catch (e) {}
    try { if (window.ytInitialData) strip(window.ytInitialData, 0) } catch (e) {}
    try { if (window.ytplayer && window.ytplayer.config && window.ytplayer.config.args) strip(window.ytplayer.config.args, 0) } catch (e) {}
  }
  cleanGlobals()
  document.addEventListener('DOMContentLoaded', cleanGlobals)
  setInterval(function () {
    cleanGlobals()
    var sels = '.ytp-ad-player-overlay,.ytp-ad-text-overlay,.ytp-ad-module,.ytp-ad-skip-button-container,.ytp-ad-skip-button,.ytp-ad-skip-button-modern,.ytp-ad-survey-overlay,.ytp-ad-image-overlay,.ytp-ad-overlay-slot,.video-ads,ytd-display-ad-renderer,.ytd-search-pyv-renderer,ytd-in-feed-ad-renderer,ytd-ad-slot-renderer,ytd-companion-slot-renderer,ytd-promoted-sparkles-web-renderer,ytd-ad-feedback-renderer'
    try { document.querySelectorAll(sels).forEach(function (el) { el.remove() }) } catch (e) {}
    try {
      var skip = document.querySelector('.ytp-ad-skip-button, .ytp-ad-skip-button-modern')
      if (skip) skip.click()
      var adVid = document.querySelector('.ytp-ad-player-overlay video, video.ad-showing, .html5-video-player.ad-showing video')
      if (adVid && document.querySelector('.html5-video-player.ad-showing')) {
        try { adVid.pause() } catch (e) {}
      }
    } catch (e) {}
  }, 800)
})()
`
