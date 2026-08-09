const { app, BrowserWindow } = require('electron')

app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ width: 400, height: 300, show: true })
    await win.loadURL('data:text/html,' + encodeURIComponent(`<!doctype html>
<style>body{margin:0}#t{width:200px;height:80px;background:#456;margin:40px;color:#fff}</style>
<div id="t">drop target</div>
<script>
  const t = document.getElementById('t')
  t.ondragover = (e) => { window.dov = (window.dov||0)+1; e.preventDefault() }
  t.ondrop = (e) => { e.preventDefault(); window.drp = (window.drp||0)+1 }
  t.ondragenter = () => { window.den = (window.den||0)+1 }
  t.ondragleave = () => { window.dle = (window.dle||0)+1 }
</script>`))
    const wc = win.webContents
    wc.debugger.attach('1.3')
    const pt = await wc.executeJavaScript(`(() => { const r = document.getElementById('t').getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) } })()`)
    const data = {
      items: [
        { mimeType: 'text/plain', data: 'hello' },
        { mimeType: 'application/x-nixer-tab', data: JSON.stringify({ tabId: 't1', url: 'https://example.com', title: 'X' }) },
      ],
      dragOperationsMask: 1,
    }
    await wc.debugger.sendCommand('Input.dispatchDragEvent', { type: 'dragEnter', x: pt.x, y: pt.y, data, modifiers: 0 })
    await wc.debugger.sendCommand('Input.dispatchDragEvent', { type: 'drop', x: pt.x, y: pt.y, data, modifiers: 0 })
    await new Promise((r) => setTimeout(r, 400))
    const st = await wc.executeJavaScript(`({ den: window.den, dov: window.dov, drp: window.drp, dle: window.dle })`)
    const types = await wc.executeJavaScript(`(() => { let r=null; window.addEventListener('drop', e => { r = Array.from(e.dataTransfer.types) }, { once: true }); return r })()`).catch(() => null)
    console.log('CDP_TEST:', JSON.stringify({ pt, st, types }))
    try { wc.debugger.detach() } catch {}
    win.destroy()
    const ok = st.den >= 1 && st.dov >= 1 && st.drp >= 1
    setTimeout(() => app.exit(ok ? 0 : 1), 200)
  } catch (e) {
    console.log('ERR', e && e.stack)
    setTimeout(() => app.exit(2), 200)
  }
})
setTimeout(() => { console.log('HARD_TIMEOUT'); app.exit(3) }, 30000)
