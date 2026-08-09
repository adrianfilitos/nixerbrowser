const { net } = require('electron')
const store = require('./store')

function autocompleteQuery(q) {
  const input = (q || '').trim()
  if (!input) return []
  const out = []
  const looksUrl = /^[\w-]+(\.[\w-]+)+([/:?#].*)?$/.test(input) || /^localhost(:\d+)?(\/.*)?$/.test(input)
  if (looksUrl) {
    out.push({ type: 'url', title: input, url: /^https?:\/\//.test(input) ? input : 'https://' + input })
  }
  const term = input.toLowerCase()
  store.searchHistory(term, 3).forEach((h) => out.push({ type: 'history', title: h.title || h.url, url: h.url, meta: h.url }))
  store.searchBookmarks(term, 3).forEach((b) => out.push({ type: 'bookmark', title: b.title || b.url, url: b.url, meta: b.url }))
  const engine = store.engineById(store.settings().defaultSearchEngine)
  out.push({ type: 'search', title: 'Buscar en ' + engine.name + ': ' + input, url: store.engineSearchUrl(engine, input) })
  return out.slice(0, 8)
}

const SUGGEST_URLS = {
  google: 'https://suggestqueries.google.com/complete/search?client=firefox&q={q}',
  duckduckgo: 'https://duckduckgo.com/ac/?q={q}&type=list',
  bing: 'https://api.bing.com/osjson.aspx?query={q}',
  brave: 'https://search.brave.com/api/suggest?q={q}',
  yahoo: 'https://search.yahoo.com/sugg/gossip/gossip-us-ura/?output=json&command={q}',
  startpage: 'https://www.startpage.com/sp/custom_search/suggest?q={q}',
  qwant: 'https://api.qwant.com/v3/suggest?q={q}',
  ecosia: 'https://ac.ecosia.org/?q={q}',
  mojeek: 'https://www.mojeek.com/search/q?query={q}&fmt=json',
}

function parseSuggestions(json) {
  let arr = null
  if (Array.isArray(json)) arr = json[1]
  else if (json && Array.isArray(json.results)) arr = json.results
  if (!Array.isArray(arr)) return []
  return arr
    .map((x) => (typeof x === 'string' ? x : x && (x.query || x.suggestion || x.phrase || x.value)))
    .filter((x) => typeof x === 'string' && x.trim())
    .slice(0, 6)
}

async function searchSuggestions(q) {
  const term = (q || '').trim()
  if (!term || term.length < 2) return []
  const engineId = store.settings().defaultSearchEngine
  const tpl = SUGGEST_URLS[engineId] || SUGGEST_URLS.google
  try {
    const res = await net.fetch(tpl.replace('{q}', encodeURIComponent(term)), {
      signal: AbortSignal.timeout(2500),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/' + String(process.versions.chrome).split('.')[0] + '.0.0.0 Safari/537.36' },
    })
    if (!res.ok) return []
    const json = await res.json().catch(() => null)
    return parseSuggestions(json)
  } catch {
    return []
  }
}

module.exports = { autocompleteQuery, searchSuggestions }
