import { useEffect, useState } from 'react'
import { useAuth, type CachedAccount } from '../lib/auth'

type Bridge = Window & {
  credManager?: { getCachedAccounts?: () => Promise<CachedAccount[]> }
}

export default function LoginPage() {
  const { login, selectAccount } = useAuth()
  const [busy,       setBusy]       = useState(false)
  const [selecting,  setSelecting]  = useState<string | null>(null)
  const [error,      setError]      = useState('')
  const [accounts,   setAccounts]   = useState<CachedAccount[] | null>(null) // null = loading

  useEffect(() => {
    const win = window as Bridge
    win.credManager?.getCachedAccounts?.()
      .then(a => setAccounts(a ?? []))
      .catch(() => setAccounts([]))
  }, [])

  async function handleSelect(homeAccountId: string) {
    setSelecting(homeAccountId)
    setError('')
    const result = await selectAccount(homeAccountId)
    if (!result.ok) {
      setError(result.error ?? 'Failed to sign in with that account')
      setSelecting(null)
    }
  }

  async function handleLogin() {
    setBusy(true)
    setError('')
    const result = await login()
    if (!result.ok) {
      setError(result.error ?? 'Login failed')
      setBusy(false)
    }
  }

  const hasCachedAccounts = accounts !== null && accounts.length > 0
  const isLoading = accounts === null

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: 'var(--bg)',
    }}>
      <div style={{
        width: 400, padding: '40px 36px', borderRadius: 16,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: '0 8px 32px rgba(0,0,0,.12)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
      }}>
        {/* Logo */}
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

        {/* Loading cached accounts */}
        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-3)', fontSize: 13 }}>
            <span className="icon icon-sm" style={{ animation: 'spin .8s linear infinite' }}>sync</span>
            Checking for saved accounts…
          </div>
        )}

        {/* Account picker — shown when multiple accounts are cached */}
        {hasCachedAccounts && (
          <>
            <div style={{ width: '100%', textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>
                Choose an account
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
                Select a Microsoft account to continue
              </div>
            </div>

            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {accounts!.map(acc => {
                const initials = acc.name
                  ? acc.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                  : acc.email.slice(0, 2).toUpperCase()
                const isBusy = selecting === acc.homeAccountId

                return (
                  <button
                    key={acc.homeAccountId}
                    onClick={() => handleSelect(acc.homeAccountId)}
                    disabled={selecting !== null}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      width: '100%', padding: '12px 14px',
                      border: '1px solid var(--border)', borderRadius: 10,
                      background: 'var(--surface-2)',
                      cursor: selecting !== null ? 'default' : 'pointer',
                      opacity: selecting !== null && !isBusy ? 0.55 : 1,
                      textAlign: 'left', transition: 'all .12s',
                    }}
                    onMouseEnter={e => { if (!selecting) e.currentTarget.style.borderColor = 'var(--primary)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
                  >
                    <div style={{
                      width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                      background: 'var(--primary-bg)', color: 'var(--primary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 700,
                    }}>
                      {isBusy
                        ? <span className="icon icon-sm" style={{ animation: 'spin .8s linear infinite' }}>sync</span>
                        : initials
                      }
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {acc.name || acc.email}
                      </div>
                      {acc.name && (
                        <div style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {acc.email}
                        </div>
                      )}
                    </div>
                    <span className="icon icon-sm" style={{ marginLeft: 'auto', color: 'var(--text-3)', flexShrink: 0 }}>chevron_right</span>
                  </button>
                )
              })}
            </div>

            <div style={{ width: '100%', height: 1, background: 'var(--border)' }} />
          </>
        )}

        {/* Sign-in button — always shown when no accounts or as "Use a different account" */}
        {!isLoading && (
          <button
            onClick={handleLogin}
            disabled={busy || selecting !== null}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              width: '100%', padding: '11px 0',
              border: '1px solid var(--border)', borderRadius: 8,
              background: 'var(--surface-2)',
              color: 'var(--text-1)',
              fontSize: 14, fontFamily: "'Google Sans', sans-serif", fontWeight: 500,
              cursor: busy || selecting !== null ? 'default' : 'pointer',
              opacity: busy || selecting !== null ? .55 : 1,
              transition: 'all .15s',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
              <rect x="1"  y="1"  width="9" height="9" fill="#F25022"/>
              <rect x="11" y="1"  width="9" height="9" fill="#7FBA00"/>
              <rect x="1"  y="11" width="9" height="9" fill="#00A4EF"/>
              <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
            </svg>
            {busy
              ? 'Opening browser…'
              : hasCachedAccounts
              ? 'Use a different account'
              : 'Sign in with Microsoft'
            }
          </button>
        )}

        {error && (
          <div style={{
            width: '100%', padding: '10px 14px', borderRadius: 8,
            background: 'rgba(217,48,37,.08)', border: '1px solid rgba(217,48,37,.25)',
            color: 'var(--danger)', fontSize: 13, textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        {!hasCachedAccounts && !isLoading && (
          <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.5 }}>
            Your browser will open for authentication.<br/>
            Return here after signing in.
          </div>
        )}
      </div>
    </div>
  )
}
