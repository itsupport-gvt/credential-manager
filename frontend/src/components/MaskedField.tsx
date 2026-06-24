import { useState, useEffect, useRef } from 'react'
import { api } from '../lib/api'

interface MaskedFieldProps {
  label: string
  credentialId: string
  field: 'password' | 'api_key' | 'api_secret' | 'client_secret'
  hasValue: boolean
}

export function MaskedField({ label, credentialId, field, hasValue }: MaskedFieldProps) {
  const [revealedValue, setRevealedValue] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(0)
  const [copyLabel, setCopyLabel] = useState('Copy')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  if (!hasValue) {
    return (
      <div>
        {label && <div className="md-label">{label}</div>}
        <span style={{ fontSize: 14, color: 'var(--text-3)' }}>Not set</span>
      </div>
    )
  }

  async function handleReveal() {
    if (revealedValue) {
      if (timerRef.current) clearInterval(timerRef.current)
      setRevealedValue(null); setCountdown(0); return
    }
    setLoading(true); setError(null)
    try {
      const { value } = await api.revealField(credentialId, field)
      setRevealedValue(value); setCountdown(10)
      timerRef.current = setInterval(() => {
        setCountdown(c => {
          if (c <= 1) { clearInterval(timerRef.current!); setRevealedValue(null); return 0 }
          return c - 1
        })
      }, 1000)
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed') }
    finally { setLoading(false) }
  }

  async function handleCopy() {
    setLoading(true); setError(null)
    try {
      const { value } = await api.revealField(credentialId, field)
      await navigator.clipboard.writeText(value)
      setCopyLabel('Copied'); setTimeout(() => setCopyLabel('Copy'), 2000)
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <div>
      {label && <div className="md-label">{label}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'monospace', fontSize: 14,
          background: 'var(--surface-2)',
          padding: '8px 14px', borderRadius: 8,
          minWidth: 200, display: 'inline-block',
          color: revealedValue ? 'var(--text-1)' : 'var(--text-3)',
          letterSpacing: revealedValue ? 0 : 3,
          userSelect: 'all',
        }}>
          {revealedValue || '••••••••••••'}
        </span>
        <button onClick={handleCopy} disabled={loading} className="md-btn md-btn-text md-btn-sm">
          <span className="icon icon-sm">content_copy</span>
          {loading && copyLabel === 'Copy' ? '…' : copyLabel}
        </button>
        <button onClick={handleReveal} disabled={loading && !revealedValue} className="md-btn md-btn-text md-btn-sm" style={{ color: revealedValue ? 'var(--danger)' : 'var(--primary)' }}>
          <span className="icon icon-sm">{revealedValue ? 'visibility_off' : 'visibility'}</span>
          {loading && !revealedValue ? '…' : revealedValue ? `Hide (${countdown}s)` : 'Reveal'}
        </button>
      </div>
      {error && <div style={{ fontSize: 13, color: 'var(--danger)', marginTop: 6 }}>{error}</div>}
    </div>
  )
}
