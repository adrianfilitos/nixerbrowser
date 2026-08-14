export const SHIFT_CHARS = new Set('!?@#$%&*()_+=:;"\'<>/\\|{}[]~`'.split(''))

export function typeIntoWebview(id, key) {
  if (!id) return
  try {
    if (key === 'space') {
      window.api.tabInput(id, { type: 'keyDown', keyCode: ' ' })
      window.api.tabInput(id, { type: 'char', keyCode: ' ' })
      window.api.tabInput(id, { type: 'keyUp', keyCode: ' ' })
    } else if (key === 'enter') {
      window.api.tabInput(id, { type: 'keyDown', keyCode: 'Enter' })
      window.api.tabInput(id, { type: 'keyUp', keyCode: 'Enter' })
    } else if (key === 'backspace') {
      window.api.tabInput(id, { type: 'keyDown', keyCode: 'Backspace' })
      window.api.tabInput(id, { type: 'keyUp', keyCode: 'Backspace' })
    } else if (key.length === 1) {
      let mods = []
      let kc = key
      if (/^[A-ZÑ]$/.test(key)) mods = ['shift']
      else if (SHIFT_CHARS.has(key)) mods = ['shift']
      else kc = key.toUpperCase()
      window.api.tabInput(id, { type: 'keyDown', keyCode: kc, modifiers: mods })
      window.api.tabInput(id, { type: 'char', keyCode: key })
      window.api.tabInput(id, { type: 'keyUp', keyCode: kc, modifiers: mods })
    }
  } catch {}
}

export function typeIntoChrome(el, key) {
  try {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
    if (key === 'backspace') {
      setter.call(el, el.value.slice(0, -1))
      el.dispatchEvent(new Event('input', { bubbles: true }))
    } else if (key === 'enter') {
      for (const t of ['keydown', 'keyup']) el.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', bubbles: true, cancelable: true }))
    } else {
      setter.call(el, el.value + (key === 'space' ? ' ' : key))
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
  } catch {}
}
