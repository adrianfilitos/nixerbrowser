import { forwardRef, useImperativeHandle, useState } from 'react'

const LETTERS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ñ'],
  ['shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'backspace'],
  ['123', ',', 'space', '.', 'enter'],
]

const SYMBOLS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['@', '#', '$', '%', '&', '*', '(', ')', '-', '+'],
  ['=', '/', '\\', '|', '<', '>', '[', ']', '{', '}'],
  ['abc', ',', '.', '?', '!', "'", '"', 'space', 'enter'],
]

const LABELS = {
  shift: '⇧',
  backspace: '⌫',
  space: 'Espacio',
  enter: 'Entrar',
  '123': '123',
  abc: 'ABC',
}

const WIDE = new Set(['space', 'enter', 'backspace', 'shift'])

function keyLabel(k) {
  return LABELS[k] || k
}

const OnScreenKeyboard = forwardRef(function OnScreenKeyboard({ onKey }, ref) {
  const [page, setPage] = useState('letters')
  const [shift, setShift] = useState(false)
  const [sel, setSel] = useState({ r: 0, c: 0 })

  const grid = page === 'letters' ? LETTERS : SYMBOLS

  function resetSel() {
    setSel({ r: 0, c: 0 })
  }

  function switchPage(p) {
    setPage(p)
    setShift(false)
    resetSel()
  }

  function pressKey(k) {
    if (k === 'shift') {
      setShift((s) => !s)
    } else if (k === '123') {
      switchPage('symbols')
    } else if (k === 'abc') {
      switchPage('letters')
    } else if (k === 'space' || k === 'enter' || k === 'backspace') {
      onKey(k)
    } else {
      const upper = shift && /^[a-zñ]$/.test(k)
      onKey(upper ? k.toUpperCase() : k)
      if (upper) setShift(false)
    }
  }

  function nav(dir) {
    setSel((s) => {
      let { r, c } = s
      if (dir === 'left') c = Math.max(0, c - 1)
      else if (dir === 'right') c = Math.min(grid[r].length - 1, c + 1)
      else if (dir === 'up') r = Math.max(0, r - 1)
      else if (dir === 'down') r = Math.min(grid.length - 1, r + 1)
      c = Math.min(c, grid[r].length - 1)
      return { r, c }
    })
  }

  useImperativeHandle(ref, () => ({
    nav,
    press: () => {
      const row = grid[sel.r]
      if (row) pressKey(row[sel.c])
    },
  }), [grid, sel, shift])

  const isSelected = (r, c) => sel.r === r && sel.c === c

  return (
    <div className="tv-keyboard" onMouseDown={(e) => e.preventDefault()}>
      {grid.map((row, r) => (
        <div className="tv-kb-row" key={r}>
          {row.map((k, c) => (
            <button
              key={k + c}
              type="button"
              className={'tv-kb-key' + (WIDE.has(k) ? ' wide' : '') + (isSelected(r, c) ? ' selected' : '') + (k === 'shift' && shift ? ' on' : '')}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pressKey(k)}
            >
              {keyLabel(k)}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
})

export default OnScreenKeyboard
