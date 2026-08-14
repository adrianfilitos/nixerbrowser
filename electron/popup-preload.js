const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('popupAPI', {
  onContent: (cb) => {
    const l = (_e, d) => cb(d)
    ipcRenderer.on('popup-content', l)
    return () => ipcRenderer.removeListener('popup-content', l)
  },
  action: (key, data) => ipcRenderer.send('popup-action', key, data),
  close: (key) => ipcRenderer.send('popup-close', key),
  downloadsPreview: (p) => ipcRenderer.invoke('downloads:preview', p),
  cookies: (origin) => ipcRenderer.invoke('site:cookies', origin),
})
