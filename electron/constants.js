const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
const PRIVATE_PARTITION = 'navegador-incognito'
const PROFILE = (process.argv.find((a) => a.startsWith('--profile=')) || '').slice(10) || 'default'

module.exports = { DEV_SERVER_URL, PRIVATE_PARTITION, PROFILE }
