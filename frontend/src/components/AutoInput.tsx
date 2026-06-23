import { useState, useRef, type ChangeEvent } from 'react'

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px', border: '1px solid var(--border)',
  borderRadius: 8, fontSize: 13, background: 'var(--surface)', color: 'var(--text-1)',
  outline: 'none', fontFamily: 'Roboto, sans-serif',
}

interface Props {
  name: string
  value: string
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
  suggestions: string[]
  placeholder?: string
  type?: string
  required?: boolean
}

export function AutoInput({ name, value, onChange, suggestions, placeholder, type = 'text', required }: Props) {
  const [open, setOpen]     = useState(false)
  const [active, setActive] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  const filtered = value.length > 0
    ? suggestions.filter(s => s.toLowerCase().includes(value.toLowerCase()) && s.toLowerCase() !== value.toLowerCase()).slice(0, 8)
    : []

  function pick(val: string) {
    const synth = { target: { name, value: val } } as ChangeEvent<HTMLInputElement>
    onChange(synth)
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || filtered.length === 0) return
    if (e.key === 'Tab') {
      e.preventDefault()
      pick(filtered[active] ?? filtered[0])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(a => Math.min(a + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(a => Math.max(a - 1, 0))
    } else if (e.key === 'Enter' && open) {
      e.preventDefault()
      pick(filtered[active] ?? filtered[0])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        type={type}
        name={name}
        value={value}
        required={required}
        placeholder={placeholder}
        style={inp}
        onChange={e => { onChange(e); setOpen(true); setActive(0) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0, zIndex: 200,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,.18)',
          maxHeight: 220, overflowY: 'auto',
        }}>
          {filtered.map((s, i) => (
            <div
              key={s}
              onMouseDown={() => pick(s)}
              style={{
                padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                background: i === active ? 'var(--surface-2)' : 'transparent',
                color: 'var(--text-1)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <span className="icon icon-sm" style={{ fontSize: 14, color: 'var(--text-3)', flexShrink: 0 }}>history</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s}</span>
              {i === 0 && (
                <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-3)', flexShrink: 0, background: 'var(--surface-2)', padding: '1px 5px', borderRadius: 4 }}>Tab</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
