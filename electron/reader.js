const readers = new Map()

async function extractReader(wc) {
  try {
    const res = await wc.executeJavaScript(`(() => {
      const clone = document.body.cloneNode(true)
      clone.querySelectorAll('script, style, iframe, nav, header, footer, aside, form, noscript, svg').forEach(n => n.remove())
      let best = null
      let bestLen = 0
      const walker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT)
      while (walker.nextNode()) {
        const n = walker.currentNode
        const len = n.textContent.trim().length
        if (len > bestLen && n.querySelectorAll('p').length >= 2) { bestLen = len; best = n }
      }
      const text = best ? best.textContent.replace(/\\s+/g, ' ').trim() : document.body.innerText.replace(/\\s+/g, ' ').trim()
      return { title: document.title || '', url: location.href, text: text.slice(0, 150000) }
    })()`)
    const id = Date.now() + '-' + Math.floor(Math.random() * 1e5)
    readers.set(id, res)
    setTimeout(() => readers.delete(id), 120000)
    return id
  } catch {
    return null
  }
}

function getReader(id) {
  return readers.get(id) || null
}

function put(content) {
  const id = Date.now() + '-' + Math.floor(Math.random() * 1e5)
  readers.set(id, content)
  setTimeout(() => readers.delete(id), 120000)
  return id
}

module.exports = { extractReader, getReader, put }
