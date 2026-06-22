import { useState } from 'react'
import { useAuth } from '../lib/auth'

export default function LoginPage() {
  const { login } = useAuth()
  const [busy,  setBusy]  = useState(false)
  const [error, setError] = useState('')

  async function handleLogin() {
    setBusy(true)
    setError('')
    const result = await login()
    if (!result.ok) {
      setError(result.error ?? 'Login failed')
      setBusy(false)
    }
    // On success the AuthProvider updates and App re-renders — no navigation needed
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: 'var(--bg-page)',
    }}>
      {/* Card */}
      <div style={{
        width: 380, padding: '40px 36px', borderRadius: 16,
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        boxShadow: '0 8px 32px rgba(0,0,0,.12)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
      }}>
        {/* Logo + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <img src="/assets/cred_manager.svg" alt="logo" style={{ width: 36, height: 36 }} />
          <div>
            <div style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 18, color: 'var(--text-1)' }}>
              Credential Manager
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '.5px', textTransform: 'uppercase' }}>
              Gravity Business Partners
            </div>
          </div>
        </div>

        <div style={{ width: '100%', height: 1, background: 'var(--border)' }} />

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', marginBottom: 6 }}>
            Sign in to continue
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
            Use your Microsoft 365 account
          </div>
        </div>

        {/* Microsoft sign-in button */}
        <button
          onClick={handleLogin}
          disabled={busy}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            width: '100%', padding: '11px 0',
            border: '1px solid var(--border)', borderRadius: 8,
            background: busy ? 'var(--bg-card)' : 'var(--bg-page)',
            color: 'var(--text-1)',
            fontSize: 14, fontFamily: "'Google Sans', sans-serif", fontWeight: 500,
            cursor: busy ? 'default' : 'pointer',
            transition: 'all .15s',
            opacity: busy ? .65 : 1,
          }}
          onMouseEnter={e => { if (!busy) e.currentTarget.style.background = 'var(--bg-hover)' }}
          onMouseLeave={e => { e.currentTarget.style.background = busy ? 'var(--bg-card)' : 'var(--bg-page)' }}
        >
          {/* Microsoft logo SVG */}
          <svg width="20" height="20" viewBox="0 0 21 21" fill="none">
            <rect x="1"  y="1"  width="9" height="9" fill="#F25022"/>
            <rect x="11" y="1"  width="9" height="9" fill="#7FBA00"/>
            <rect x="1"  y="11" width="9" height="9" fill="#00A4EF"/>
            <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
          </svg>
          {busy ? 'Opening browser…' : 'Sign in with Microsoft'}
        </button>

        {error && (
          <div style={{
            width: '100%', padding: '10px 14px', borderRadius: 8,
            background: 'rgba(217,48,37,.08)', border: '1px solid rgba(217,48,37,.25)',
            color: '#d93025', fontSize: 13, textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.5 }}>
          Your browser will open for authentication.<br/>
          Return here after signing in.
        </div>
      </div>
    </div>
  )
}
