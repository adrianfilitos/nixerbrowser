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

module.exports = { chat }
