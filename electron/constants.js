const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
const PRIVATE_PARTITION = 'navegador-incognito'
const PROFILE = (process.argv.find((a) => a.startsWith('--profile=')) || '').slice(10) || 'default'

// Alto reservado (px) en la parte superior para el chrome DOM (pestañas +
// barra de herramientas + menús). Las vistas nativas de pestaña (WebContentsView)
// NUNCA deben superponerse a esta franja: se clampa su Y a >= CHROME_HEIGHT y su
// altura a (altoDeVentana - Y), de modo que la barra y sus menús HTML tienen su
// propio espacio limpio arriba y la página no puede taparlos ni salirse por abajo.
const CHROME_HEIGHT = 60

module.exports = { DEV_SERVER_URL, PRIVATE_PARTITION, PROFILE, CHROME_HEIGHT }
