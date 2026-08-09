const store = require('./store')

function attach(wc) {
  wc.on('did-finish-load', () => {
    if (wc.isDestroyed()) return
    const s = store.settings()
    const css = []
    if (s.pageFontSize && Number(s.pageFontSize) !== 16) {
      css.push('body{font-size:' + Number(s.pageFontSize) + 'px!important}')
    }
    let js = ''
    if (s.forcePageTheme === 'light' || s.forcePageTheme === 'dark') {
      const want = s.forcePageTheme === 'dark'
      js += `(function(){ const want=${want}; const orig=window.matchMedia.bind(window); window.matchMedia=function(q){ const m=orig(q); if(/prefers-color-scheme/i.test(q)){ try{ Object.defineProperty(m,'matches',{get:function(){return want}}); }catch(e){} } return m; }; })();`
    }
    if (!css.length && !js) return
    try {
      wc.executeJavaScript('(function(){' + js + (css.length ? 'var st=document.createElement("style");st.textContent=' + JSON.stringify(css.join('')) + ';document.head.appendChild(st);' : '') + '})()').catch(() => {})
    } catch {}
  })
}

module.exports = { attach }
