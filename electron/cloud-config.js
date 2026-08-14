// Configuración de la nube (Supabase) — backend único e invisible del navegador.
// El DESARROLLADOR rellena este archivo una vez (URL + anon key del proyecto
// gratuito) y se empaqueta dentro de la app. El usuario final nunca la ve.
// También se acepta sobrescritura por variables de entorno.
const fs = require('fs')
const path = require('path')

let cfg = { url: '', anonKey: '' }
try {
  const raw = fs.readFileSync(path.join(__dirname, 'cloud-config.json'), 'utf8')
  const d = JSON.parse(raw)
  cfg.url = String(d.url || '').trim()
  cfg.anonKey = String(d.anonKey || '').trim()
} catch {}

const envUrl = String(process.env.NIXER_SUPABASE_URL || '').trim()
const envKey = String(process.env.NIXER_SUPABASE_ANON_KEY || '').trim()
if (envUrl) cfg.url = envUrl.replace(/\/+$/, '')
if (envKey) cfg.anonKey = envKey

module.exports = {
  get url() {
    return cfg.url
  },
  get anonKey() {
    return cfg.anonKey
  },
  configured() {
    return !!(cfg.url && cfg.anonKey)
  },
}
