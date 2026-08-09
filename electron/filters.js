// Filtros de bloqueo estilo uBlock/Adblock Plus: reglas de red + cosméticas.
// Soporta la sintaxis principal de EasyList: ||ancla^, rutas, /regex/, opciones $, excepciones @@ y ##selectores.

const TYPE_MAP = {
  script: ['script'],
  image: ['image'],
  stylesheet: ['stylesheet'],
  xmlhttprequest: ['xhr', 'fetch'],
  subdocument: ['sub_frame'],
  media: ['media'],
  font: ['font'],
  object: ['object'],
  ping: ['ping'],
  websocket: ['websocket'],
  other: ['other'],
  all: null,
}

let hostIndex = new Map()          // host -> [{opts, exception}]
let hostPathIndex = new Map()      // host -> [{host, path, boundary, opts, exception}]
let regexRules = []                // [{re, opts, exception}]
let substringRules = []            // [{pat, opts, exception}]
let cosmeticByHost = new Map()     // host exacto -> [selectors]
let cosmeticGeneral = []           // selectores sin restricción de dominio
let cosmeticExceptions = new Set() // selectores exceptuados globalmente (#@#)
let filterCount = 0

function hostChain(host) {
  const parts = String(host || '').toLowerCase().split('.')
  const chain = []
  for (let i = 0; i < parts.length; i++) chain.push(parts.slice(i).join('.'))
  return chain
}

function cleanHost(h) {
  return String(h || '').trim().toLowerCase().replace(/^www\./, '').replace(/^https?:\/\//, '')
}

function boundaryOk(path, prefix) {
  if (path === prefix) return true
  if (path.startsWith(prefix + '/')) return true
  return path.length > prefix.length && !/[a-zA-Z0-9_-]/.test(path[prefix.length])
}

function hostMatch(host, ruleHost) {
  return host === ruleHost || (host.endsWith('.' + ruleHost))
}

function parseOptions(optStr) {
  if (!optStr) return null
  const opts = { types: null, thirdParty: 'any', domains: null, important: false }
  for (const rawOpt of optStr.split(',')) {
    if (!rawOpt) continue
    const neg = rawOpt.startsWith('~')
    const clean = neg ? rawOpt.slice(1) : rawOpt
    const lower = clean.toLowerCase()
    if (lower === 'third-party') opts.thirdParty = neg ? 'first' : 'third'
    else if (lower === 'first-party') opts.thirdParty = neg ? 'third' : 'first'
    else if (lower.startsWith('domain=')) {
      const ds = clean.slice(7).split('|').filter(Boolean)
      const include = []
      const exclude = []
      for (const d of ds) {
        if (d.startsWith('~')) exclude.push(cleanHost(d.slice(1)))
        else include.push(cleanHost(d))
      }
      opts.domains = { include, exclude }
    } else if (lower === 'important') {
      opts.important = true
    } else if (lower === 'all' || TYPE_MAP[lower] === null) {
      opts.types = null
    } else if (TYPE_MAP[lower]) {
      opts.types = opts.types || new Set()
      for (const t of TYPE_MAP[lower]) opts.types.add(t)
    }
  }
  return opts
}

function isBoundarySep(ch) {
  return ch === undefined || /[^a-zA-Z0-9_-]/.test(ch)
}

function compile() {
  hostIndex = new Map()
  hostPathIndex = new Map()
  regexRules = []
  substringRules = []
  cosmeticByHost = new Map()
  cosmeticGeneral = []
  cosmeticExceptions = new Set()
  filterCount = 0
}

function indexRule(map, host, rule) {
  let list = map.get(host)
  if (!list) { list = []; map.set(host, list) }
  list.push(rule)
}

function addRule(rule) {
  filterCount++
  if (rule.type === 'host') {
    indexRule(hostIndex, rule.host, rule)
  } else if (rule.type === 'hostPath') {
    indexRule(hostPathIndex, rule.host, rule)
  } else if (rule.type === 'regex') {
    regexRules.push(rule)
  } else if (rule.type === 'substring') {
    substringRules.push(rule)
  }
}

function parseNetworkLine(line) {
  let pat = line
  let exception = false
  let important = false
  if (pat.startsWith('@@')) { exception = true; pat = pat.slice(2) }
  let opts = null
  const dIdx = pat.indexOf('$')
  if (dIdx !== -1) {
    const optStr = pat.slice(dIdx + 1)
    pat = pat.slice(0, dIdx)
    opts = parseOptions(optStr)
    if (opts && opts.important) important = true
  }
  if (!pat) return null

  // /regex/ solo si empieza Y termina en barra (EasyList usa /ruta/... como patrones de ruta, no regex)
  if (pat.length > 2 && pat.startsWith('/') && pat.endsWith('/')) {
    const body = pat.slice(1, -1)
    if (process.env.DBG_FILTER) console.log('DBG_REGEX_LINE', JSON.stringify(line))
    try {
      return addRule({ type: 'regex', re: new RegExp(body, 'i'), opts, exception, important })
    } catch {
      return null
    }
  }

  // ||ancla de host
  if (pat.startsWith('||')) {
    const rest = pat.slice(2).replace(/^https?:\/\//, '')
    const slash = rest.indexOf('/')
    let hostPart = slash === -1 ? rest : rest.slice(0, slash)
    const pathPart = slash === -1 ? '' : rest.slice(slash)
    if (hostPart.endsWith('^')) hostPart = hostPart.slice(0, -1)
    hostPart = cleanHost(hostPart)
    if (!hostPart || !hostPart.includes('.')) return null
    if (!pathPart || pathPart === '/' || pathPart === '^') {
      return addRule({ type: 'host', host: hostPart, opts, exception, important })
    }
    const path = pathPart.replace(/\^$/, '')
    return addRule({ type: 'hostPath', host: hostPart, path: path, boundary: pathPart.endsWith('^'), opts, exception, important })
  }

  // |ancla de inicio (protocolo u host exacto)
  if (pat.startsWith('|')) {
    const rest = pat.slice(1).replace(/^https?:\/\//, '')
    const slash = rest.indexOf('/')
    const hostPart = slash === -1 ? rest : rest.slice(0, slash)
    const pathPart = slash === -1 ? '' : rest.slice(slash)
    const host = cleanHost(hostPart)
    if (host.includes('.')) {
      if (!pathPart || pathPart === '/' || pathPart === '^') {
        return addRule({ type: 'host', host, opts, exception, important })
      }
      return addRule({ type: 'hostPath', host, path: pathPart.replace(/\^$/, ''), boundary: pathPart.endsWith('^'), opts, exception, important })
    }
  }

  // patrón plano (substring sobre la URL)
  const cleanPat = pat.replace(/\^/g, '')
  if (cleanPat && cleanPat.length >= 3) {
    return addRule({ type: 'substring', pat: cleanPat.toLowerCase(), opts, exception, important })
  }
  return null
}

function addCosmetic(domain, selector) {
  if (!selector) return
  if (domain) cosmeticByHost.set(domain, [...(cosmeticByHost.get(domain) || []), selector])
  else cosmeticGeneral.push(selector)
}

function parseCosmetic(hostDomain, selector, exception) {
  if (exception) {
    if (!hostDomain) cosmeticExceptions.add(selector)
    return
  }
  addCosmetic(hostDomain, selector)
}

function parseListText(text) {
  const lines = String(text || '').split(/\r?\n/)
  let inHeader = true
  for (let raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (inHeader && line.startsWith('[')) { inHeader = false; continue }
    if (line.startsWith('!')) continue
    // Cosmético de excepción
    if (line.includes('#@#')) {
      const i = line.indexOf('#@#')
      const selector = line.slice(i + 3).trim()
      cosmeticExceptions.add(selector)
      continue
    }
    // Cosmético
    if (line.includes('##')) {
      const i = line.indexOf('##')
      const domainPart = line.slice(0, i)
      const selector = line.slice(i + 2).trim()
      for (const d of domainPart ? domainPart.split(',') : ['']) {
        parseCosmetic(cleanHost(d), selector, false)
      }
      continue
    }
    if (line.startsWith('#')) continue
    // Regla de red
    if (line.includes('*') || line.includes('^') || line.startsWith('@@') || line.startsWith('||') || line.startsWith('|') || line.startsWith('/')) {
      parseNetworkLine(line)
    } else if (line.includes('.') && line.includes('/')) {
      parseNetworkLine(line)
    }
  }
}

function parseList(text) {
  compile()
  parseListText(text)
  return { filterCount, regexRules, substringRules, cosmeticByHost, cosmeticGeneral, cosmeticExceptions }
}

function typeApplies(rule, type) {
  if (!rule.opts || !rule.opts.types) return true
  return rule.opts.types.has(type)
}

function domainsApply(rule, pageHost) {
  const d = rule.opts && rule.opts.domains
  if (!d) return true
  if (d.include.length && !d.include.some((h) => hostMatch(pageHost, h))) return false
  if (d.exclude.length && d.exclude.some((h) => hostMatch(pageHost, h))) return false
  return true
}

function partyApplies(rule, isThirdParty) {
  if (!rule.opts) return true
  if (rule.opts.thirdParty === 'third') return isThirdParty
  if (rule.opts.thirdParty === 'first') return !isThirdParty
  return true
}

function ruleOptsMatch(rule, pageHost, isThirdParty, resourceType) {
  return typeApplies(rule, resourceType) && domainsApply(rule, pageHost) && partyApplies(rule, isThirdParty)
}

function hostPathRuleMatch(rule, url, pageHost, isThirdParty, resourceType) {
  if (!ruleOptsMatch(rule, pageHost, isThirdParty, resourceType)) return false
  let u
  try { u = new URL(url) } catch { return false }
  const p = u.pathname
  return rule.boundary ? boundaryOk(p, rule.path) : p.startsWith(rule.path)
}

// Excepciones primero; luego reglas de bloqueo. Retorna true si hay coincidencia.
function scan(url, host, pageHost, isThirdParty, resourceType, exceptionsOnly) {
  const lower = url.toLowerCase()
  for (const h of hostChain(host)) {
    const list = hostIndex.get(h)
    if (list) {
      for (const r of list) {
        if (r.exception === exceptionsOnly && ruleOptsMatch(r, pageHost, isThirdParty, resourceType)) {
          if (!exceptionsOnly && process.env.DBG_FILTER) console.log('DBG_MATCHED_RULE', JSON.stringify({ type: 'host', host: r.host }), url, resourceType)
          return true
        }
      }
    }
  }
  for (const h of hostChain(host)) {
    const list = hostPathIndex.get(h)
    if (list) {
      for (const r of list) {
        if (r.exception === exceptionsOnly && hostPathRuleMatch(r, url, pageHost, isThirdParty, resourceType)) {
          if (!exceptionsOnly && process.env.DBG_FILTER) console.log('DBG_MATCHED_RULE', JSON.stringify({ type: 'hostPath', host: r.host, path: r.path }), url, resourceType)
          return true
        }
      }
    }
  }
  for (const r of regexRules) {
    if (r.exception === exceptionsOnly && ruleOptsMatch(r, pageHost, isThirdParty, resourceType) && r.re.test(url)) {
      if (!exceptionsOnly && process.env.DBG_FILTER) console.log('DBG_MATCHED_RULE', JSON.stringify({ type: 'regex', re: String(r.re) }), url, resourceType)
      return true
    }
  }
  for (const r of substringRules) {
    if (r.exception === exceptionsOnly && ruleOptsMatch(r, pageHost, isThirdParty, resourceType) && lower.includes(r.pat)) {
      if (!exceptionsOnly && process.env.DBG_FILTER) console.log('DBG_MATCHED_RULE', JSON.stringify({ type: 'substring', pat: r.pat }), url, resourceType)
      return true
    }
  }
  return false
}

function activate() {
  // Las reglas ya llevan su bandera exception; no hace falta recompilar.
}

function matches(url, resourceType, pageHost) {
  let host = ''
  let isThirdParty = false
  try {
    const u = new URL(url)
    host = u.hostname.toLowerCase()
    isThirdParty = !!pageHost && pageHost !== host
  } catch {
    return false
  }
  const type = resourceType || 'other'
  if (scan(url, host, pageHost, isThirdParty, type, true)) return false
  return scan(url, host, pageHost, isThirdParty, type, false)
}

function cosmeticFor(host) {
  const out = []
  for (const h of hostChain(host)) {
    const s = cosmeticByHost.get(h)
    if (s) out.push(...s)
  }
  out.push(...cosmeticGeneral)
  return out.filter((s) => !cosmeticExceptions.has(s))
}

function hostChain(host) {
  const parts = String(host || '').toLowerCase().split('.')
  const chain = []
  for (let i = 0; i < parts.length - 1; i++) chain.push(parts.slice(i).join('.'))
  return chain
}

function stats() {
  return { filters: filterCount, hostRules: hostIndex.size, hostPathRules: hostPathIndex.size, regex: regexRules.length, cosmetic: cosmeticGeneral.length + cosmeticByHost.size }
}

module.exports = { parseList, activate, matches, cosmeticFor, stats, TYPE_MAP }
