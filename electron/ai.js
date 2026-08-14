const store = require('./store')

async function chat(messages) {
  const s = store.settings()
  const base = (s.aiBaseUrl || '').trim()
  const key = store.decryptSecret((s.aiApiKey || '').trim())
  const model = (s.aiModel || 'gpt-4o-mini').trim()
  const temperature = s.aiTemperature !== undefined ? s.aiTemperature : 0.7
  const maxTokens = s.aiMaxTokens || 1000
  if (!base || !key) {
    return { error: 'Configura el proveedor de IA y la clave en Ajustes (sección IA).' }
  }
  try {
    const url = base.replace(/\/+$/, '') + '/chat/completions'
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key,
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
      signal: AbortSignal.timeout(60000),
    })
    if (!res.ok) {
      const body = await res.text()
      return { error: 'Error ' + res.status + ': ' + body.slice(0, 400) }
    }
    const data = await res.json()
    const choice = data.choices && data.choices[0] && data.choices[0].message
    if (choice && choice.content) return { text: choice.content }
    return { error: 'Respuesta vacía del modelo.' }
  } catch (e) {
    return { error: 'No se pudo conectar con la IA: ' + e.message }
  }
}

const stripHtml = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()

async function searchWeb(query) {
  const q = String(query || '').trim()
  if (!q) return []
  try {
    const res = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return []
    const html = await res.text()
    const results = []
    for (const block of html.split('<div class="result"')) {
      if (block.indexOf('result__a') === -1) continue
      const titleMatch = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block)
      if (!titleMatch) continue
      let target = titleMatch[1]
      const uddg = target.match(/[?&]uddg=([^&]+)/)
      if (uddg) { try { target = decodeURIComponent(uddg[1]) } catch {} }
      if (!/^https?:\/\//i.test(target)) continue
      const snipMatch = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/.exec(block)
      results.push({ title: stripHtml(titleMatch[2]), url: target, snippet: stripHtml(snipMatch && snipMatch[1]) })
      if (results.length >= 5) break
    }
    return results
  } catch (e) {
    return []
  }
}

module.exports = { chat, searchWeb }
