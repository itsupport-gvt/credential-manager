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
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  if (!hasValue) {
    return (
      <div>
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</div>
        <span className="text-sm text-gray-400 dark:text-gray-500 italic">Not set</span>
      </div>
    )
  }

  async function handleReveal() {
    if (revealedValue) {
      // Re-mask
      clearTimers()
      setRevealedValue(null)
      setCountdown(0)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const { value } = await api.revealField(credentialId, field)
      setRevealedValue(value)
      setCountdown(10)

      timerRef.current = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            clearTimers()
            setRevealedValue(null)
            return 0
          }
          return c - 1
        })
      }, 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reveal')
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    setLoading(true)
    setError(null)
    try {
      const { value } = await api.revealField(credentialId, field)
      await navigator.clipboard.writeText(value)
      setCopyLabel('Copied!')
      setTimeout(() => setCopyLabel('Copy'), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to copy')
    } finally {
      setLoading(false)
    }
  }

  function clearTimers() {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }

  return (
    <div>
      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded min-w-[180px] select-all">
          {revealedValue ? (
            <span className="text-gray-900 dark:text-gray-100">{revealedValue}</span>
          ) : (
            <span className="text-gray-400 tracking-widest">••••••••••••</span>
          )}
        </span>

        <button
          onClick={handleCopy}
          disabled={loading}
          className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          title="Copy to clipboard without revealing"
        >
          {loading && copyLabel === 'Copy' ? '...' : copyLabel}
        </button>

        <button
          onClick={handleReveal}
          disabled={loading && !revealedValue}
          className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          title={revealedValue ? 'Hide value' : 'Reveal value for 10 seconds'}
        >
          {loading && !revealedValue
            ? '...'
            : revealedValue
              ? `Hide (${countdown}s)`
              : 'Reveal'}
        </button>
      </div>

      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  )
}
