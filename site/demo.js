(function () {
  'use strict'

  var I = {
    es: {
      newtab: 'Nueva pestaña',
      placeholder: 'Buscar o escribir una dirección…',
      greet: 'Hola 👋',
      time: 'Listo para navegar',
      home: 'Inicio',
      searchTag: 'Resultados simulados para',
      blocked: 'anuncios y rastreadores bloqueados',
      visitBtn: 'Visitar en el navegador instalado',
      visitSub: 'Los sitios reales se abren en Nixer Browser instalado.',
      visitSec: 'Conexión simulada',
      back: 'Atrás',
      fwd: 'Adelante',
      reload: 'Recargar',
      closeOv: 'Cerrar overlay',
      game: 'Juego en pantalla completa',
      gameHint: 'el overlay flota encima',
      ovAddr: 'Escribe una dirección en el overlay…',
      ovTxt: 'Página de la wiki dentro del overlay',
    },
    en: {
      newtab: 'New tab',
      placeholder: 'Search or type an address…',
      greet: 'Hi 👋',
      time: 'Ready to browse',
      home: 'Home',
      searchTag: 'Simulated results for',
      blocked: 'ads and trackers blocked',
      visitBtn: 'Open in the installed browser',
      visitSub: 'Real sites open in installed Nixer Browser.',
      visitSec: 'Simulated connection',
      back: 'Back',
      fwd: 'Forward',
      reload: 'Reload',
      closeOv: 'Close overlay',
      game: 'Fullscreen game',
      gameHint: 'the overlay floats on top',
      ovAddr: 'Type an address in the overlay…',
      ovTxt: 'Wiki page inside the overlay',
    },
  }

  var QUICK = [
    { label: 'YouTube', icon: '▶', url: 'youtube.com' },
    { label: 'Twitch', icon: '🟣', url: 'twitch.tv' },
    { label: 'Wikipedia', icon: '📖', url: 'wikipedia.org' },
    { label: 'Steam', icon: '🎮', url: 'store.steampowered.com' },
    { label: 'Maps', icon: '🗺️', url: 'google.com/maps' },
    { label: 'Noticias', icon: '📰', url: 'news.google.com' },
  ]

  var OSK_ROW1 = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p']
  var OSK_ROW2 = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ñ']

  var D = {
    tabs: [],
    active: 0,
    seq: 0,
    incognito: false,
    tv: false,
    overlay: false,
    blocked: 0,
  }

  function $(id) { return document.getElementById(id) }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] }) }
  function lang() { return (document.documentElement.lang === 'en') ? 'en' : 'es' }
  function t(key) { return (I[lang()] && I[lang()][key]) || I.es[key] || key }

  var view = $('demoView')

  function tabById(id) { return D.tabs.find(function (x) { return x.id === id }) }
  function active() { return D.tabs[D.active] }

  function newTab(raw) {
    var id = 'd' + (++D.seq)
    var tab = { id: id, url: '', hist: [], idx: -1 }
    D.tabs.push(tab)
    D.active = D.tabs.length - 1
    if (raw) navigate(id, raw)
    else navigate(id, '', false)
    renderTabs()
    renderToolbar()
    renderView()
    return tab
  }

  function closeTab(id) {
    var i = D.tabs.findIndex(function (x) { return x.id === id })
    if (i < 0) return
    D.tabs.splice(i, 1)
    if (!D.tabs.length) { newTab() ; return }
    if (D.active >= D.tabs.length) D.active = D.tabs.length - 1
    renderAll()
  }

  function switchTab(id) {
    var i = D.tabs.findIndex(function (x) { return x.id === id })
    if (i >= 0) { D.active = i; renderAll() }
  }

  function resolveTarget(q) {
    q = (q || '').trim()
    if (!q) return { type: 'newtab' }
    var lower = q.toLowerCase()
    if (lower === 'about:newtab' || lower === 'newtab' || lower === 'about:home') return { type: 'newtab' }
    if (/^https?:\/\//i.test(q) || /^[\w-]+(\.[\w-]+)+(:\d+)?([/?#].*)?$/.test(q)) {
      var host = q.replace(/^https?:\/\//i, '').split('/')[0].split(':')[0]
      return { type: 'visit', host: host }
    }
    return { type: 'search', q: q }
  }

  function navigate(id, raw, push) {
    var tab = tabById(id)
    if (!tab) return
    var target = resolveTarget(raw)
    if (push !== false) {
      tab.hist = tab.hist.slice(0, tab.idx + 1)
      tab.hist.push(target)
      tab.idx = tab.hist.length - 1
    }
    D.blocked++
    tab.url = target.type === 'newtab' ? '' : raw
    renderAll()
  }

  function back() {
    var tab = active()
    if (!tab || tab.idx <= 0) return
    tab.idx--
    tab.url = tab.hist[tab.idx].type === 'newtab' ? '' : displayOf(tab.hist[tab.idx])
    renderAll()
  }
  function forward() {
    var tab = active()
    if (!tab || tab.idx >= tab.hist.length - 1) return
    tab.idx++
    tab.url = tab.hist[tab.idx].type === 'newtab' ? '' : displayOf(tab.hist[tab.idx])
    renderAll()
  }
  function displayOf(e) { return e.type === 'search' ? e.q : (e.type === 'visit' ? e.host : '') }

  /* ---------- render ---------- */
  function renderAll() { renderTabs(); renderToolbar(); renderView() }

  function renderTabs() {
    var box = $('demoTabs')
    box.innerHTML = D.tabs.map(function (tab, i) {
      var entry = tab.hist[tab.idx]
      var title = entry && entry.type === 'visit' ? entry.host : (entry && entry.type === 'search' ? entry.q : t('newtab'))
      var activeCls = i === D.active ? ' active' : ''
      return '<div class="demo-tab' + activeCls + '" data-id="' + tab.id + '">' +
        '<span class="demo-tab-title">' + esc(title) + '</span>' +
        '<button class="demo-tab-x" data-close="' + tab.id + '" title="✕">✕</button></div>'
    }).join('') + '<button class="demo-tab-new" id="demoTabNew" title="+">+</button>'
    box.querySelectorAll('.demo-tab').forEach(function (el) {
      el.addEventListener('click', function () { switchTab(el.getAttribute('data-id')) })
    })
    box.querySelectorAll('.demo-tab-x').forEach(function (el) {
      el.addEventListener('click', function (e) { e.stopPropagation(); closeTab(el.getAttribute('data-close')) })
    })
    $('demoTabNew').addEventListener('click', function () { newTab() })
  }

  function renderToolbar() {
    var tab = active()
    var addr = $('demoAddress')
    if (document.activeElement !== addr) addr.value = tab ? tab.url : ''
    $('demoBack').disabled = !(tab && tab.idx > 0)
    $('demoFwd').disabled = !(tab && tab.idx < tab.hist.length - 1)
    $('demoBlocked').textContent = D.blocked
    $('demoIncognito').classList.toggle('on', D.incognito)
    $('demoTv').classList.toggle('on', D.tv)
    $('demoOverlay').classList.toggle('on', D.overlay)
    $('demoShield').title = D.blocked + ' ' + t('blocked')
  }

  function renderView() {
    var tab = active()
    var entry = tab ? (tab.hist[tab.idx] || { type: 'newtab' }) : { type: 'newtab' }
    if (D.overlay) {
      view.innerHTML = gameHTML(entry)
      $('demoOsk').hidden = true
      $('demoHud').hidden = true
      return
    }
    var html = ''
    switch (entry.type) {
      case 'visit': html = visitHTML(entry); break
      case 'search': html = searchHTML(entry); break
      default: html = newtabHTML()
    }
    view.innerHTML = html
    bindView(entry)
    $('demoHud').hidden = !D.tv
    $('demoOsk').hidden = !D.tv
  }

  /* ---------- páginas ---------- */
  function newtabHTML() {
    return '<div class="demo-page nt"><div class="nt-greet">' + t('greet') + '</div>' +
      '<div class="nt-time">' + t('time') + '</div>' +
      '<div class="nt-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg><span>' + t('placeholder') + '</span></div>' +
      '<div class="nt-links">' + QUICK.map(function (q) {
        return '<button class="nt-link" data-q="' + esc(q.url) + '"><span class="nt-ico">' + q.icon + '</span>' + esc(q.label) + '</button>'
      }).join('') + '</div></div>'
  }

  function visitHTML(e) {
    return '<div class="demo-page visit"><div class="visit-ico">' + esc(e.host[0].toUpperCase()) + '</div>' +
      '<h3>' + esc(e.host) + '</h3>' +
      '<p>' + t('visitSub') + '</p>' +
      '<a class="btn btn-cta" href="https://github.com/adrianfilitos/nixerbrowser/releases" target="_blank" rel="noopener">' + t('visitBtn') + '</a>' +
      '<div class="visit-meta">🔒 ' + t('visitSec') + ' · ' + esc(e.host) + '</div></div>'
  }

  function searchHTML(e) {
    var results = [
      { u: 'ejemplo.org/' + e.q.replace(/\W+/g, '-'), t: e.q + ' — la web de referencia', d: 'Una breve descripción simulada del resultado principal para tu búsqueda.' },
      { u: 'wiki.example/' + e.q.replace(/\W+/g, '_'), t: e.q + ' · Wikipedia', d: 'Artículo enciclopédico simulado sobre el tema que buscas.' },
      { u: 'noticias.example/' + e.q.replace(/\W+/g, '-'), t: 'Últimas noticias sobre ' + e.q, d: 'Resumen simulado de noticias relacionadas con tu búsqueda.' },
      { u: 'tienda.example/' + e.q.replace(/\W+/g, '-'), t: 'Comprar ' + e.q + ' al mejor precio', d: 'Resultado de compra simulado con anuncios bloqueados.' },
    ]
    return '<div class="demo-page sr"><div class="sr-tag">' + t('searchTag') + ' “' + esc(e.q) + '”</div>' +
      '<div class="sr-blocked">🛡 ' + D.blocked + ' ' + t('blocked') + '</div>' +
      results.map(function (r) {
        return '<button class="sr-item" data-q="' + esc(r.u) + '"><div class="sr-u">' + esc(r.u) + '</div><div class="sr-t">' + esc(r.t) + '</div><div class="sr-d">' + esc(r.d) + '</div></button>'
      }).join('') + '</div>'
  }

  function gameHTML() {
    return '<div class="demo-game"><div class="demo-game-label"><b>🎮 ' + t('game') + '</b><br>' + t('gameHint') + '</div>' +
      '<div class="demo-overlay-win"><div class="demo-overlay-tabs"><span class="act">YouTube</span><span>Wiki</span><span class="plus">+</span></div>' +
      '<div class="demo-overlay-addr">' + t('ovAddr') + '</div>' +
      '<div class="demo-overlay-body">' + t('ovTxt') + '<br><br>Nixer · navegación<br>Overlay con pestañas<br>atajo: Ctrl+Shift+O</div></div>' +
      '<button class="demo-overlay-x" id="demoOverlayClose" title="' + t('closeOv') + '">✕</button></div>'
  }

  function bindView(entry) {
    view.querySelectorAll('.nt-link').forEach(function (el) {
      el.addEventListener('click', function () { navigate(active().id, el.getAttribute('data-q')) })
    })
    view.querySelectorAll('.sr-item').forEach(function (el) {
      el.addEventListener('click', function () { navigate(active().id, el.getAttribute('data-q')) })
    })
    if (entry && entry.type === 'visit') {
      view.querySelector('.visit-ico').style.background = 'linear-gradient(135deg, rgba(108,123,255,0.22), rgba(139,92,246,0.18))'
    }
  }

  /* ---------- barra de direcciones ---------- */
  $('demoAddress').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') navigate(active().id, this.value)
  })

  /* ---------- toolbar ---------- */
  $('demoBack').addEventListener('click', back)
  $('demoFwd').addEventListener('click', forward)
  $('demoReload').addEventListener('click', function () {
    var tab = active(); if (!tab) return
    D.blocked++
    renderAll()
  })
  $('demoShield').addEventListener('click', function () { D.blocked += 13; renderToolbar() })

  $('demoIncognito').addEventListener('click', function () {
    D.incognito = !D.incognito
    $('demoBrowser').classList.toggle('demo-incognito', D.incognito)
    renderToolbar()
  })
  $('demoTv').addEventListener('click', function () { D.tv = !D.tv; renderView() })
  $('demoOverlay').addEventListener('click', function () { D.overlay = !D.overlay; renderView() })

  view.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'demoOverlayClose') { D.overlay = false; renderView() }
  })

  /* cursor TV sigue al ratón */
  view.addEventListener('mousemove', function (e) {
    var c = document.querySelector('.hud-cursor')
    if (!c) return
    var r = view.getBoundingClientRect()
    c.style.left = (e.clientX - r.left) + 'px'
    c.style.top = (e.clientY - r.top) + 'px'
  })

  /* teclado en pantalla */
  function buildOsk() {
    var o = $('demoOsk')
    o.innerHTML = OSK_ROW1.concat(OSK_ROW2).map(function (k) { return '<span data-k="' + k + '">' + k + '</span>' }).join('') +
      '<span class="wide" data-k=" ">␣</span><span class="wide" data-k="back">⌫</span>'
    o.addEventListener('click', function (e) {
      var k = e.target && e.target.getAttribute('data-k')
      if (!k) return
      var addr = $('demoAddress')
      if (k === 'back') { addr.value = addr.value.slice(0, -1) }
      else addr.value += k
      addr.focus()
    })
  }
  buildOsk()

  /* ---------- chips ---------- */
  document.querySelectorAll('.demo-chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      var kind = chip.getAttribute('data-demo')
      if (kind === 'shield') { D.blocked += 40; renderToolbar(); pulse(chip) }
      else if (kind === 'tv') { D.tv = !D.tv; chip.classList.toggle('on', D.tv); renderView() }
      else if (kind === 'incognito') {
        D.incognito = !D.incognito
        $('demoBrowser').classList.toggle('demo-incognito', D.incognito)
        chip.classList.toggle('on', D.incognito)
        renderToolbar()
      }
      else if (kind === 'overlay') { D.overlay = !D.overlay; chip.classList.toggle('on', D.overlay); renderView() }
    })
  })

  function pulse(el) {
    el.style.transform = 'scale(1.06)'
    setTimeout(function () { el.style.transform = '' }, 160)
  }

  /* ---------- i18n para strings generados ---------- */
  document.addEventListener('langchange', function () { renderAll(); buildOsk() })

  /* ---------- arranque ---------- */
  newTab()
})()
