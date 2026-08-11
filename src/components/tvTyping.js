export const SHIFT_CHARS = new Set('!?@#$%&*()_+=:;"\'<>/\\|{}[]~`'.split(''))

export function typeIntoWebview(el, key) {
  if (!el) return
  try {
    if (key === 'space') {
      el.sendInputEvent({ type: 'keyDown', keyCode: ' ' })
      el.sendInputEvent({ type: 'char', keyCode: ' ' })
      el.sendInputEvent({ type: 'keyUp', keyCode: ' ' })
    } else if (key === 'enter') {
      el.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
      el.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' })
    } else if (key === 'backspace') {
      el.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' })
      el.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' })
    } else if (key.length === 1) {
      let mods = []
      let kc = key
      if (/^[A-ZÑ]$/.test(key)) mods = ['shift']
      else if (SHIFT_CHARS.has(key)) mods = ['shift']
      else kc = key.toUpperCase()
      el.sendInputEvent({ type: 'keyDown', keyCode: kc, modifiers: mods })
      el.sendInputEvent({ type: 'char', keyCode: key })
      el.sendInputEvent({ type: 'keyUp', keyCode: kc, modifiers: mods })
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
