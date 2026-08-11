(function () {
  'use strict'

  /* ---------- i18n ---------- */
  var I18N = {
    es: {
      'nav.demo': 'Demo',
      'nav.gallery': 'Galería',
      'nav.features': 'Características',
      'nav.download': 'Descargar',
      'nav.cta': 'Descargar',
      'hero.badge': 'Windows · Gratis · Código abierto',
      'hero.title': 'Navega. Juega. <em>Sin distracciones.</em>',
      'hero.sub': 'Nixer Browser es un navegador para Windows que bloquea anuncios, protege tu privacidad y se queda contigo cuando juegas: Modo TV con mando y un overlay que puedes abrir encima del juego con un atajo.',
      'hero.download': 'Descargar para Windows',
      'hero.gh': 'Ver en GitHub',
      'hero.meta': 'Instalador NSIS · v',
      'demo.title': 'Pruébala sin instalar',
      'demo.sub': 'Una demo interactiva de la interfaz. Crea pestañas, navega, activa el escudo, el Modo TV o el overlay.',
      'demo.chipShield': 'Escudo',
      'demo.chipTv': 'Modo TV',
      'demo.chipIncognito': 'Incógnito',
      'demo.chipOverlay': 'Overlay en juegos',
      'demo.note': 'Demo interactiva con navegación simulada — no carga sitios reales.',
      'gallery.title': 'Hecho para el juego',
      'gallery.sub': 'Un vistazo a las funciones pensadas para tu pantalla y tu mando.',
      'gallery.game': 'Juego a pantalla completa',
      'gallery.gameCap': 'Overlay con pestañas abierto encima del juego (atajo Ctrl+Shift+O o combo del mando).',
      'gallery.tv': 'Modo TV',
      'gallery.tvCap': 'Modo TV: cursor con el stick, teclado en pantalla y guía de atajos para el mando Xinput.',
      'gallery.shieldCap': 'anuncios y rastreadores bloqueados en esta sesión',
      'gallery.shieldSub': 'Escudo de privacidad: bloqueo de anuncios, pop-ups, cookies y rastreadores de terceros.',
      'features.title': 'Todo lo que un navegador debería tener',
      'features.sub': 'Construido sobre Chromium con una capa de interfaz en React, sin telemetría de por medio.',
      'feat.adb': 'Bloqueo de anuncios',
      'feat.adbD': 'Bloquea anuncios, pop-ups y rastreadores de fábrica, sin extensiones extra.',
      'feat.priv': 'Privacidad',
      'feat.privD': 'Cookies y scripts de terceros, DoH, navegación segura y DNT configurables.',
      'feat.tv': 'Modo TV',
      'feat.tvD': 'Navega desde el sofá: mando Xinput, cursor con el stick, teclado en pantalla y guía de atajos.',
      'feat.ovl': 'Overlay en juegos',
      'feat.ovlD': 'Mini-navegador con pestañas que se abre encima del juego con Ctrl+Shift+O o el combo del mando.',
      'feat.ext': 'Extensiones',
      'feat.extD': 'Carga extensiones CRX y scripts de contenido, y gestiona su activación por sitio.',
      'feat.inc': 'Incógnito',
      'feat.incD': 'Ventana privada con partición de sesión aislada y sin historial.',
      'feat.ws': 'Workspaces y grupos',
      'feat.wsD': 'Espacios de trabajo, grupos de pestañas y búsqueda instantánea de pestañas.',
      'feat.ia': 'Comandos e IA',
      'feat.iaD': 'Paleta de comandos con atajos, asistente IA configurable, modo lectura y administrador de tareas.',
      'dl.title': 'Descarga Nixer Browser',
      'dl.sub': 'Instalador para Windows · NSIS. Sin registro, sin telemetría. La versión que aparece es siempre la última publicada.',
      'dl.btn': 'Descargar para Windows',
      'dl.alt': 'Ver todas las versiones →',
      'footer.gh': 'GitHub',
      'footer.releases': 'Releases',
      'footer.copy': 'Hecho con cariño para Windows',
    },
    en: {
      'nav.demo': 'Demo',
      'nav.gallery': 'Gallery',
      'nav.features': 'Features',
      'nav.download': 'Download',
      'nav.cta': 'Download',
      'hero.badge': 'Windows · Free · Open source',
      'hero.title': 'Browse. Play. <em>No distractions.</em>',
      'hero.sub': 'Nixer Browser is a Windows browser that blocks ads, protects your privacy and stays with you while you play: a TV mode with gamepad and an overlay you can open on top of your game with a shortcut.',
      'hero.download': 'Download for Windows',
      'hero.gh': 'View on GitHub',
      'hero.meta': 'NSIS installer · v',
      'demo.title': 'Try it without installing',
      'demo.sub': 'An interactive demo of the interface. Create tabs, browse, turn on the shield, TV mode or the overlay.',
      'demo.chipShield': 'Shield',
      'demo.chipTv': 'TV mode',
      'demo.chipIncognito': 'Incognito',
      'demo.chipOverlay': 'Game overlay',
      'demo.note': 'Interactive demo with simulated browsing — it does not load real sites.',
      'gallery.title': 'Built for gaming',
      'gallery.sub': 'A look at the features built for your screen and your gamepad.',
      'gallery.game': 'Fullscreen game',
      'gallery.gameCap': 'Overlay with tabs open on top of the game (Ctrl+Shift+O shortcut or gamepad combo).',
      'gallery.tv': 'TV mode',
      'gallery.tvCap': 'TV mode: stick cursor, on-screen keyboard and a shortcut guide for the Xinput gamepad.',
      'gallery.shieldCap': 'ads and trackers blocked in this session',
      'gallery.shieldSub': 'Privacy shield: blocks ads, pop-ups, third-party cookies and trackers.',
      'features.title': 'Everything a browser should have',
      'features.sub': 'Built on Chromium with a React UI layer and no telemetry.',
      'feat.adb': 'Ad blocking',
      'feat.adbD': 'Blocks ads, pop-ups and trackers out of the box, no extra extensions.',
      'feat.priv': 'Privacy',
      'feat.privD': 'Third-party cookies and scripts, DoH, safe browsing and DNT configurable.',
      'feat.tv': 'TV mode',
      'feat.tvD': 'Couch browsing: Xinput gamepad, stick cursor, on-screen keyboard and a shortcut guide.',
      'feat.ovl': 'Game overlay',
      'feat.ovlD': 'A mini browser with tabs that opens over your game with Ctrl+Shift+O or a gamepad combo.',
      'feat.ext': 'Extensions',
      'feat.extD': 'Load CRX extensions and content scripts, and control them per site.',
      'feat.inc': 'Incognito',
      'feat.incD': 'Private window with an isolated session partition and no history.',
      'feat.ws': 'Workspaces & groups',
      'feat.wsD': 'Workspaces, tab groups and instant tab search.',
      'feat.ia': 'Commands & AI',
      'feat.iaD': 'Command palette with shortcuts, configurable AI assistant, reading mode and task manager.',
      'dl.title': 'Download Nixer Browser',
      'dl.sub': 'Windows installer · NSIS. No sign-up, no telemetry. The version shown is always the latest release.',
      'dl.btn': 'Download for Windows',
      'dl.alt': 'View all releases →',
      'footer.gh': 'GitHub',
      'footer.releases': 'Releases',
      'footer.copy': 'Made with care for Windows',
    },
  }

  var STORE_KEY = 'nixer-lang'
  var lang = 'es'

  function applyLang(next) {
    lang = next
    try { localStorage.setItem(STORE_KEY, next) } catch (e) {}
    document.documentElement.lang = next
    document.querySelectorAll('[data-lang]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-lang') === next)
    })
    var dict = I18N[next] || I18N.es
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n')
      if (key in dict) el.innerHTML = dict[key]
    })
    document.dispatchEvent(new CustomEvent('langchange', { detail: next }))
  }

  var detected = 'es'
  try {
    var saved = localStorage.getItem(STORE_KEY)
    var navLang = (navigator.language || '').toLowerCase()
    if (saved === 'es' || saved === 'en') detected = saved
    else if (navLang.indexOf('en') === 0) detected = 'en'
  } catch (e) {}
  document.querySelectorAll('[data-lang]').forEach(function (b) {
    b.addEventListener('click', function () { applyLang(b.getAttribute('data-lang')) })
  })
  applyLang(detected)

  /* ---------- Release dinámico (GitHub API) ---------- */
  var GH_API = 'https://api.github.com/repos/adrianfilitos/nixerbrowser/releases/latest'
  var exeRE = /\.exe$/i
  function prettySize(n) {
    if (!n) return ''
    var mb = n / (1024 * 1024)
    return (mb >= 100 ? Math.round(mb) : Math.round(mb * 10) / 10) + ' MB'
  }
  fetch(GH_API)
    .then(function (r) { return r.ok ? r.json() : null })
    .then(function (rel) {
      if (!rel) return
      var version = rel.tag_name || ''
      var exe = (rel.assets || []).filter(function (a) { return a.name && exeRE.test(a.name) })[0]
      var url = exe && exe.browser_download_url
      if (version) {
        var clean = String(version).replace(/^v/i, '')
        var vs = document.querySelectorAll('#heroVersion, #dlVersion')
        vs.forEach(function (el) { el.textContent = clean })
        document.title = document.title.replace(/1\.0\.0|v1\.0\.0/, 'v' + clean)
      }
      if (exe && exe.size) { var s = document.getElementById('dlSize'); if (s) s.textContent = '≈ ' + prettySize(exe.size) }
      if (url) {
        var btn = document.getElementById('dlButton')
        if (btn) btn.href = url
      }
    })
    .catch(function () {})

  /* ---------- Año y reveal ---------- */
  document.getElementById('year').textContent = new Date().getFullYear()

  var revealEls = document.querySelectorAll('.section')
  var io = 'IntersectionObserver' in window
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target) }
        })
      }, { threshold: 0.12 })
    : null
  if (io) revealEls.forEach(function (el) { el.classList.add('reveal'); io.observe(el) })
  else revealEls.forEach(function (el) { el.classList.add('in') })
})()
