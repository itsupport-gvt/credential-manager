import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import { api } from './lib/api'
import { AuthProvider, useAuth } from './lib/auth'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import CredentialsPage from './pages/CredentialsPage'
import CredentialDetailPage from './pages/CredentialDetailPage'
import NewCredentialPage from './pages/NewCredentialPage'
import EditCredentialPage from './pages/EditCredentialPage'
import ChangeLogPage from './pages/ChangeLogPage'
import TenantsPage from './pages/TenantsPage'
import CategoriesPage from './pages/CategoriesPage'
import SettingsPage from './pages/SettingsPage'
import UsersPage from './pages/UsersPage'

const isElectron = typeof window !== 'undefined' && !!(window as Window & { credManager?: unknown }).credManager
const H_HEIGHT = 56

// ── Toast system ─────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info'
interface Toast { id: number; type: ToastType; message: string }
interface ToastContextValue { showToast: (message: string, type?: ToastType) => void }

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })
export function useToast() { return useContext(ToastContext) }
let toastCounter = 0

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null
  return (
    <div style={{
      position: 'fixed', bottom: 24, left: 24, zIndex: 9999,
      display: 'flex', flexDirection: 'column-reverse', gap: 8, maxWidth: 420,
    }}>
      {toasts.map((t) => (
        <div key={t.id} className="animate-in" style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '12px 16px',
          borderRadius: 8,
          background: '#3c4043',
          color: '#fff',
          fontSize: 14,
          fontFamily: "'Google Sans', sans-serif",
          fontWeight: 400,
          minHeight: 48,
        }}>
          <span className="icon icon-sm" style={{
            color: t.type === 'success' ? '#81c995' : t.type === 'error' ? '#f28b82' : '#8ab4f8',
          }}>
            {t.type === 'success' ? 'check_circle' : t.type === 'error' ? 'error' : 'info'}
          </span>
          <span style={{ flex: 1 }}>{t.message}</span>
          <button
            onClick={() => onDismiss(t.id)}
            style={{
              background: 'none', border: 'none', color: '#bdc1c6',
              cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center',
              borderRadius: 4,
            }}
          >
            <span className="icon icon-sm">close</span>
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Sync button ───────────────────────────────────────────────────────────────

function SyncButton({ showToast }: { showToast: (msg: string, type?: ToastType) => void }) {
  const [open, setOpen]       = useState(false)
  const [pending, setPending] = useState(0)
  const [busy, setBusy]       = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const load = () => api.getSyncStatus().then(s => setPending(s.pending_credentials + s.pending_logs)).catch(() => {})
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  async function doSync(action: 'push' | 'pull' | 'both') {
    setBusy(true); setOpen(false)
    try {
      // Top-bar button syncs credentials + change log only. Reference data
      // (tenants, categories, users, dropdown lists) syncs from Settings.
      if (action === 'push' || action === 'both') { const r = await api.pushToExcel('credentials'); showToast(`Pushed ${r.pushed_credentials} credentials`, 'success') }
      if (action === 'pull' || action === 'both') { const r = await api.pullFromExcel('credentials'); showToast(`Pulled ${r.credentials} credentials`, 'success') }
      const s = await api.getSyncStatus(); setPending(s.pending_credentials + s.pending_logs)
    } catch (err) { showToast(err instanceof Error ? err.message : 'Sync failed', 'error') }
    finally { setBusy(false) }
  }

  const synced = pending === 0
  const icon   = busy ? 'sync' : (synced ? 'cloud_done' : 'cloud_upload')
  const label  = busy ? 'Syncing' : synced ? 'Synced' : `${pending} pending`

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={busy}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, height: 36,
          padding: '0 12px',
          border: 'none',
          borderRadius: 18,
          background: 'transparent',
          color: synced ? 'var(--text-2)' : 'var(--warn)',
          fontSize: 13,
          fontFamily: "'Google Sans', sans-serif", fontWeight: 500,
          cursor: 'pointer',
          transition: 'background-color .12s',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--h-hover-bg)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <span className="icon icon-sm" style={{ animation: busy ? 'spin .8s linear infinite' : 'none' }}>{icon}</span>
        {label}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)', minWidth: 220, zIndex: 200,
          background: 'var(--h-dropdown-bg)', border: '1px solid var(--h-dropdown-bdr)',
          borderRadius: 8, boxShadow: 'var(--shadow-2)', overflow: 'hidden',
          padding: '6px 0',
        }}>
          {[
            { label: 'Push to SharePoint', icon: 'upload', action: 'push' as const },
            { label: 'Pull from SharePoint', icon: 'download', action: 'pull' as const },
            { label: 'Push & Pull', icon: 'sync', action: 'both' as const },
          ].map(item => (
            <button key={item.action} onClick={() => doSync(item.action)} style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%',
              padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 14, color: 'var(--h-dropdown-text)', textAlign: 'left',
              fontFamily: "'Google Sans', sans-serif",
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--h-dropdown-hover)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <span className="icon icon-sm" style={{ color: 'var(--text-2)' }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Admin log panel ──────────────────────────────────────────────────────────

function LogPanel({ onClose }: { onClose: () => void }) {
  const [lines, setLines] = useState<string[]>([])
  const [paused, setPaused] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const poll = () => {
      api.getAdminLogs(300)
        .then(d => { if (!paused) setLines(d.lines) })
        .catch(() => {})
    }
    poll()
    const id = setInterval(poll, 2000)
    return () => clearInterval(id)
  }, [paused])

  useEffect(() => {
    if (!paused) bottomRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [lines, paused])

  function lineColor(line: string): string {
    if (/ ERROR /.test(line)) return '#f28b82'
    if (/ WARNING /.test(line)) return '#fdd663'
    return 'var(--text-2)'
  }

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, height: 260, zIndex: 200,
      background: 'var(--surface)', borderTop: '2px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      boxShadow: '0 -4px 24px rgba(0,0,0,.12)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 12px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', fontFamily: 'monospace', letterSpacing: 1, textTransform: 'uppercase' }}>
          Server Logs
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <button
            title={paused ? 'Resume live tail' : 'Pause scroll'}
            onClick={() => setPaused(p => !p)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 4, display: 'flex' }}
          >
            <span className="icon icon-sm">{paused ? 'play_arrow' : 'pause'}</span>
          </button>
          <button
            title="Clear view"
            onClick={() => setLines([])}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 4, display: 'flex' }}
          >
            <span className="icon icon-sm">delete_sweep</span>
          </button>
          <button
            title="Close"
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 4, display: 'flex' }}
          >
            <span className="icon icon-sm">close</span>
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        style={{ flex: 1, overflowY: 'auto', padding: '8px 14px', fontFamily: 'monospace', fontSize: 11.5, lineHeight: 1.55 }}
      >
        {lines.length === 0
          ? <span style={{ color: 'var(--text-3)' }}>No log entries yet…</span>
          : lines.map((line, i) => (
            <div key={i} style={{ color: lineColor(line), whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{line}</div>
          ))
        }
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

// ── Icon button (theme, settings) ─────────────────────────────────────────────

function HeaderIconBtn({ icon, title, onClick }: { icon: string; title: string; onClick: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 36, height: 36, borderRadius: 18, border: 'none',
        background: 'transparent', color: 'var(--text-2)',
        cursor: 'pointer', transition: 'background-color .12s', flexShrink: 0,
      }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--h-hover-bg)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <span className="icon icon-sm">{icon}</span>
    </button>
  )
}

// ── User avatar / logout menu ─────────────────────────────────────────────────

function UserMenu() {
  const { user, authEnabled, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  if (!authEnabled || !user) return null

  const initials = (user.name || user.email || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={`${user.name} (${user.role})`}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: '50%',
          background: 'var(--primary)',
          color: '#fff', cursor: 'pointer',
          border: 'none',
          fontSize: 12,
          fontFamily: "'Google Sans', sans-serif", fontWeight: 500,
          flexShrink: 0,
        }}
      >
        {initials}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)', minWidth: 260, zIndex: 200,
          background: 'var(--h-dropdown-bg)', border: '1px solid var(--h-dropdown-bdr)',
          borderRadius: 12, boxShadow: 'var(--shadow-2)', overflow: 'hidden',
        }}>
          <div style={{ padding: '20px 16px', textAlign: 'center', borderBottom: '1px solid var(--h-dropdown-bdr)' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'var(--primary)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, fontWeight: 500, fontFamily: "'Google Sans', sans-serif",
              margin: '0 auto 12px',
            }}>{initials}</div>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-1)' }}>{user.name || user.email}</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{user.email}</div>
            <div style={{
              marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 500,
              background: 'var(--surface-3)', color: 'var(--text-2)',
            }}>
              {user.role}
            </div>
          </div>
          <button
            onClick={async () => { setOpen(false); await logout() }}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%',
              padding: '12px 16px', border: 'none', background: 'none',
              color: 'var(--h-dropdown-text)', cursor: 'pointer', fontSize: 14,
              fontFamily: "'Google Sans', sans-serif",
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--h-dropdown-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <span className="icon icon-sm" style={{ color: 'var(--text-2)' }}>logout</span>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

// ── Nav items ─────────────────────────────────────────────────────────────────

type NavItem = { to: string; end?: boolean; label: string; icon: string }

const NAV: NavItem[] = [
  { to: '/', end: true, label: 'Dashboard', icon: 'dashboard' },
  { to: '/credentials', label: 'Credentials', icon: 'lock' },
  { to: '/changelog', label: 'Activity', icon: 'history' },
  { to: '/tenants', label: 'Tenants', icon: 'business' },
  { to: '/categories', label: 'Categories', icon: 'category' },
]

const NAV_ADMIN: NavItem[] = [
  { to: '/users', label: 'Users', icon: 'group' },
]

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}

function AppInner() {
  const { user, loading, authEnabled } = useAuth()
  const navigate = useNavigate()
  const isAdmin = !authEnabled || user?.role === 'Admin'
  const canCreate = !authEnabled || user?.role === 'Admin' || user?.role === 'Editor'

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n' && canCreate) {
        e.preventDefault()
        navigate('/credential/new')
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '`' && isAdmin) {
        e.preventDefault()
        setLogPanelOpen(o => !o)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [navigate, canCreate, isAdmin])

  const [toasts, setToasts] = useState<Toast[]>([])
  const [logPanelOpen, setLogPanelOpen] = useState(false)
  const [theme, setThemeState] = useState<'light' | 'dark'>(() =>
    (localStorage.getItem('cred-theme') as 'light' | 'dark') || 'light'
  )

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++toastCounter
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }, [])

  useEffect(() => {
    const win = window as Window & { credManager?: { getTheme?: () => Promise<string> } }
    win.credManager?.getTheme?.().then(t => {
      if (t === 'dark' || t === 'light') setThemeState(t)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    type UpdateBridge = Window & {
      credManager?: {
        onUpdateAvailable?:    (cb: (info: { version: string }) => void) => void
        onUpdateNotAvailable?: (cb: () => void) => void
      }
    }
    const win = window as UpdateBridge
    win.credManager?.onUpdateAvailable?.((info) => {
      showToast(`Update v${info.version} available — downloading in background`, 'info')
    })
    win.credManager?.onUpdateNotAvailable?.(() => {
      showToast('You\'re on the latest version', 'success')
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('cred-theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setThemeState(t => {
      const next = t === 'light' ? 'dark' : 'light'
      const win = window as Window & { credManager?: { setTheme?: (t: string) => Promise<unknown> } }
      win.credManager?.setTheme?.(next).catch(() => {})
      return next
    })
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-3)' }}>
      <span className="icon" style={{ fontSize: 32, animation: 'spin .8s linear infinite' }}>sync</span>
    </div>
  )

  if (authEnabled && !user) return (
    <ToastContext.Provider value={{ showToast }}>
      <LoginPage />
      <ToastContainer toasts={toasts} onDismiss={id => setToasts(prev => prev.filter(t => t.id !== id))} />
    </ToastContext.Provider>
  )

  return (
    <ToastContext.Provider value={{ showToast }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

        {/* ── Top app bar — clean, minimal, single line ─────────────────── */}
        <header className="app-header" style={{
          position: 'sticky', top: 0, zIndex: 50,
          background: 'var(--h-bg)',
          borderBottom: '1px solid var(--h-border)',
          height: H_HEIGHT,
          display: 'flex', alignItems: 'center',
          flexShrink: 0,
        }}>
          <div style={{
            width: '100%', maxWidth: 1440, margin: '0 auto',
            padding: '0 24px',
            display: 'flex', alignItems: 'center', gap: 0, height: '100%',
          }}>

            {/* Brand */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, paddingRight: 32 }}>
              <img src="/assets/cred_manager.svg" alt="" style={{ width: 24, height: 24 }} />
              <div style={{
                fontFamily: "'Google Sans', sans-serif",
                fontWeight: 400,
                fontSize: 20,
                color: 'var(--text-1)',
                letterSpacing: -.2,
                lineHeight: 1,
              }}>
                Credential Manager
              </div>
            </div>

            {/* Nav */}
            <nav style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, overflow: 'hidden' }}>
              {[...NAV, ...(isAdmin ? NAV_ADMIN : [])].map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '0 14px', height: 36,
                    borderRadius: 18, textDecoration: 'none', whiteSpace: 'nowrap',
                    fontFamily: "'Google Sans', sans-serif", fontWeight: 500, fontSize: 13,
                    background: isActive ? 'var(--h-active-bg)' : 'transparent',
                    color: isActive ? 'var(--h-active-txt)' : 'var(--text-2)',
                    transition: 'background-color .12s, color .12s',
                  })}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLAnchorElement
                    if (el.getAttribute('aria-current') !== 'page') {
                      el.style.background = 'var(--h-hover-bg)'
                      el.style.color = 'var(--text-1)'
                    }
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLAnchorElement
                    if (el.getAttribute('aria-current') !== 'page') {
                      el.style.background = 'transparent'
                      el.style.color = 'var(--text-2)'
                    }
                  }}
                >
                  <span className="icon icon-sm">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </nav>

            {/* Right controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, paddingLeft: 12 }}>
              {canCreate && (
                <button
                  onClick={() => navigate('/credential/new')}
                  title="New Credential (Ctrl+N)"
                  className="md-btn md-btn-tonal md-btn-sm"
                  style={{ marginRight: 8 }}
                >
                  <span className="icon icon-sm">add</span>New
                </button>
              )}
              <SyncButton showToast={showToast} />
              <HeaderIconBtn
                icon={theme === 'light' ? 'dark_mode' : 'light_mode'}
                title={theme === 'light' ? 'Dark mode' : 'Light mode'}
                onClick={toggleTheme}
              />
              <HeaderIconBtn
                icon="settings"
                title="Settings"
                onClick={() => navigate('/settings')}
              />
              {isAdmin && (
                <HeaderIconBtn
                  icon="terminal"
                  title="Server logs (admin)"
                  onClick={() => setLogPanelOpen(o => !o)}
                />
              )}
              <div style={{ marginLeft: 8 }}>
                <UserMenu />
              </div>

              {isElectron && <div style={{ width: 138, flexShrink: 0 }} />}
            </div>
          </div>
        </header>

        {/* ── Page content ──────────────────────────────────────────────── */}
        <main style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
          <div style={{ maxWidth: 1440, margin: '0 auto', padding: '32px 24px' }}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/credentials" element={<CredentialsPage />} />
              <Route path="/credential/new" element={<NewCredentialPage />} />
              <Route path="/credential/:id" element={<CredentialDetailPage />} />
              <Route path="/credential/:id/edit" element={<EditCredentialPage />} />
              <Route path="/changelog" element={<ChangeLogPage />} />
              <Route path="/tenants" element={<TenantsPage />} />
              <Route path="/categories" element={<CategoriesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </div>
        </main>
      </div>

      {isAdmin && logPanelOpen && <LogPanel onClose={() => setLogPanelOpen(false)} />}
      <ToastContainer toasts={toasts} onDismiss={id => setToasts(prev => prev.filter(t => t.id !== id))} />
    </ToastContext.Provider>
  )
}

function NotFound() {
  const navigate = useNavigate()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 360, gap: 16 }}>
      <span className="icon icon-xl" style={{ color: 'var(--text-3)' }}>search_off</span>
      <div className="page-title">Page not found</div>
      <button className="md-btn md-btn-tonal" onClick={() => navigate('/')}>Go to Dashboard</button>
    </div>
  )
}
