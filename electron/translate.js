const { net } = require('electron')

const DELIM = 'NIXER_TRANSLATE_DELIM_NIXER'
const cache = new Map()

async function translateText(text, tl) {
  const key = (tl || 'es') + ':' + text
  if (cache.has(key)) return cache.get(key)
  if (!text || text.length > 12000) return text
  try {
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' + (tl || 'es') + '&dt=t&q=' + encodeURIComponent(text)
    const res = await net.fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return null
    const json = await res.json()
    if (!Array.isArray(json) || !Array.isArray(json[0])) return null
    const out = json[0].map((x) => (x && x[0]) || '').join('')
    cache.set(key, out)
    if (cache.size > 5000) cache.clear()
    return out
  } catch {
    return null
  }
}

async function translatePage(wc) {
  if (!wc) return false
  try {
    const pageUrl = wc.getURL() || ''
    if (!/^https?:/.test(pageUrl)) return false
    const segments = await wc.executeJavaScript(`(function () {
      const seen = new Set(), out = []
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      while (walk.nextNode()) {
        const t = walk.currentNode.data.trim()
        if (t.length > 3 && /[a-zA-Z\\u00C0-\\u024F]/.test(t) && !seen.has(t)) { seen.add(t); out.push(t) }
      }
      return out
    })()`).catch(() => [])
    if (!Array.isArray(segments) || !segments.length) return false

    const results = {}
    for (let i = 0; i < segments.length; i += 15) {
      const chunk = segments.slice(i, i + 15)
      const translated = await translateText(chunk.join(DELIM), 'es')
      if (!translated) break
      const parts = translated.split(DELIM)
      chunk.forEach((orig, k) => { if (parts[k] && parts[k].trim()) results[orig] = parts[k] })
    }
    if (!Object.keys(results).length) return false

    await wc.executeJavaScript(`(function () {
      const map = ${JSON.stringify(results)}
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      const todo = []
      while (walk.nextNode()) {
        const t = walk.currentNode.data.trim()
        if (map[t]) todo.push([walk.currentNode, t])
      }
      todo.forEach(function (p) { p[0].data = p[0].data.replace(p[1], map[p[1]]) })
      if (document.getElementById('nixer-tbar')) return
      const bar = document.createElement('div')
      bar.id = 'nixer-tbar'
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#111827;color:#fff;font:13px/42px system-ui,sans-serif;padding:0 16px;display:flex;gap:12px;align-items:center;box-shadow:0 2px 12px rgba(0,0,0,.35)'
      const lbl = document.createElement('span'); lbl.textContent = '✓ Traducido al español · '
      const btn = document.createElement('button')
      btn.textContent = 'Mostrar original'
      btn.style.cssText = 'background:#1f2937;color:#fff;border:1px solid #374151;border-radius:6px;padding:4px 12px;cursor:pointer;font:12px system-ui'
      btn.onclick = function () { location.reload() }
      bar.appendChild(lbl); bar.appendChild(btn)
      document.body.prepend(bar)
    })()`).catch(() => {})
    return true
  } catch {
    return false
  }
}

module.exports = { translateText, translatePage }
