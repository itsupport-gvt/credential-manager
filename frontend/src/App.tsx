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

// ── Constants ─────────────────────────────────────────────────────────────────

const isElectron = typeof window !== 'undefined' && !!(window as Window & { credManager?: unknown }).credManager

// Header is always dark — these are fixed, not theme-responsive
const H_BG          = '#16191f'
const H_BORDER      = 'rgba(255,255,255,.08)'
const H_TEXT        = 'rgba(255,255,255,.6)'
const H_TEXT_ACTIVE = '#ffffff'
const H_ACTIVE_BG   = 'rgba(66,133,244,.18)'
const H_ACTIVE_TXT  = '#82b4ff'
const H_HOVER_BG    = 'rgba(255,255,255,.07)'
const H_DIVIDER     = 'rgba(255,255,255,.12)'
const H_HEIGHT      = 44

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
    <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 380 }}>
      {toasts.map((t) => (
        <div key={t.id} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '11px 15px',
          borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,.25)',
          background: t.type === 'success' ? '#188038' : t.type === 'error' ? '#d93025' : '#202124',
          color: '#fff', fontSize: 13, fontFamily: "'Google Sans', sans-serif", fontWeight: 500,
          animation: 'fadeIn .2s ease',
        }}>
          <span className="icon icon-sm">{t.type === 'success' ? 'check_circle' : t.type === 'error' ? 'error' : 'info'}</span>
          <span style={{ flex: 1 }}>{t.message}</span>
          <button onClick={() => onDismiss(t.id)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', opacity: .7, padding: 0, lineHeight: 1 }}>
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
      if (action === 'push' || action === 'both') { const r = await api.pushToExcel(); showToast(`Pushed ${r.pushed_credentials} credentials`, 'success') }
      if (action === 'pull' || action === 'both') { const r = await api.pullFromExcel(); showToast(`Pulled ${r.credentials} credentials`, 'success') }
      const s = await api.getSyncStatus(); setPending(s.pending_credentials + s.pending_logs)
    } catch (err) { showToast(err instanceof Error ? err.message : 'Sync failed', 'error') }
    finally { setBusy(false) }
  }

  const synced  = pending === 0
  const pillBg  = synced ? 'rgba(52,168,83,.18)'  : 'rgba(251,176,27,.18)'
  const pillClr = synced ? '#4caf50'               : '#fbb01b'
  const pillBdr = synced ? 'rgba(52,168,83,.3)'   : 'rgba(251,176,27,.3)'
  const pillIcon = busy ? 'sync' : (synced ? 'cloud_done' : 'cloud_upload')

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={busy}
        style={{
          display: 'flex', alignItems: 'center', gap: 5, height: 28,
          padding: '0 10px', border: `1px solid ${pillBdr}`, borderRadius: 14,
          background: pillBg, color: pillClr,
          fontSize: 12, fontFamily: "'Google Sans', sans-serif", fontWeight: 600,
          cursor: 'pointer', transition: 'all .15s', whiteSpace: 'nowrap',
        }}
      >
        <span className="icon icon-sm" style={{ fontSize: 14, animation: busy ? 'spin .8s linear infinite' : 'none' }}>{pillIcon}</span>
        {busy ? 'Syncing…' : synced ? 'Synced' : `${pending} pending`}
        <span className="icon icon-sm" style={{ fontSize: 12 }}>expand_more</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)', minWidth: 200, zIndex: 200,
          background: '#1e2330', border: '1px solid rgba(255,255,255,.1)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,.5)', overflow: 'hidden',
        }}>
          {[
            { label: 'Push to SharePoint', icon: 'upload', action: 'push' as const },
            { label: 'Pull from SharePoint', icon: 'download', action: 'pull' as const },
            { label: 'Push & Pull', icon: 'sync', action: 'both' as const },
          ].map(item => (
            <button key={item.action} onClick={() => doSync(item.action)} style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: '10px 14px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 13, color: 'rgba(255,255,255,.8)', textAlign: 'left',
              transition: 'background .1s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.06)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <span className="icon icon-sm" style={{ color: H_ACTIVE_TXT }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
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
        width: 30, height: 30, borderRadius: 6, border: 'none',
        background: 'transparent', color: H_TEXT,
        cursor: 'pointer', transition: 'background .12s, color .12s', flexShrink: 0,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = H_HOVER_BG; e.currentTarget.style.color = H_TEXT_ACTIVE }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = H_TEXT }}
    >
      <span className="icon icon-sm" style={{ fontSize: 18 }}>{icon}</span>
    </button>
  )
}

// ── User avatar / logout menu ─────────────────────────────────────────────────

const ROLE_COLOR: Record<string, string> = {
  Admin:   '#4285f4',
  Editor:  '#34a853',
  Viewer:  '#fbbc05',
  Auditor: '#ea4335',
}

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
  const roleColor = ROLE_COLOR[user.role] || '#666'

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={`${user.name} (${user.role})`}
        style={{
          display: 'flex', alignItems: 'center', gap: 7, height: 30,
          padding: '0 8px', border: '1px solid rgba(255,255,255,.15)',
          borderRadius: 20, background: 'rgba(255,255,255,.06)',
          color: '#fff', cursor: 'pointer', fontSize: 12,
          fontFamily: "'Google Sans', sans-serif", fontWeight: 600,
        }}
      >
        <span style={{
          width: 22, height: 22, borderRadius: '50%',
          background: roleColor, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700, flexShrink: 0,
        }}>{initials}</span>
        <span style={{ maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.name || user.email}
        </span>
        <span className="icon icon-sm" style={{ fontSize: 14, opacity: .6 }}>expand_more</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)', minWidth: 210, zIndex: 200,
          background: '#1e2330', border: '1px solid rgba(255,255,255,.1)',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.5)', overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{user.name}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', marginTop: 2 }}>{user.email}</div>
            <div style={{
              marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
              background: roleColor + '22', color: roleColor, border: `1px solid ${roleColor}44`,
            }}>
              <span className="icon icon-sm" style={{ fontSize: 12 }}>shield</span>
              {user.role}
            </div>
          </div>
          <button
            onClick={async () => { setOpen(false); await logout() }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: '10px 14px', border: 'none', background: 'none',
              color: 'rgba(255,255,255,.7)', cursor: 'pointer', fontSize: 13,
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.06)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <span className="icon icon-sm" style={{ color: '#ea4335' }}>logout</span>
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
  const isAdmin = user?.role === 'Admin'
  const navigate = useNavigate()
  const [toasts, setToasts] = useState<Toast[]>([])
  const [theme, setThemeState] = useState<'light' | 'dark'>(() =>
    (localStorage.getItem('cred-theme') as 'light' | 'dark') || 'light'
  )

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++toastCounter
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }, [])

  // Load persisted theme from Electron on mount (overrides localStorage)
  useEffect(() => {
    const win = window as Window & { credManager?: { getTheme?: () => Promise<string> } }
    win.credManager?.getTheme?.().then(t => {
      if (t === 'dark' || t === 'light') setThemeState(t)
    }).catch(() => {})
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

  // Gate: loading spinner
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-3)' }}>
      <span className="icon" style={{ fontSize: 32, animation: 'spin .8s linear infinite' }}>sync</span>
    </div>
  )

  // Gate: login required
  if (authEnabled && !user) return (
    <ToastContext.Provider value={{ showToast }}>
      <LoginPage />
      <ToastContainer toasts={toasts} onDismiss={id => setToasts(prev => prev.filter(t => t.id !== id))} />
    </ToastContext.Provider>
  )

  return (
    <ToastContext.Provider value={{ showToast }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

        {/* ── Top app bar (always dark) ─────────────────────────────────── */}
        <header className="app-header" style={{
          position: 'sticky', top: 0, zIndex: 50,
          background: H_BG,
          borderBottom: `1px solid ${H_BORDER}`,
          height: H_HEIGHT,
          display: 'flex', alignItems: 'center',
          flexShrink: 0,
        }}>
          <div style={{
            width: '100%', maxWidth: 1400, margin: '0 auto',
            padding: '0 16px',
            display: 'flex', alignItems: 'center', gap: 0, height: '100%',
          }}>

            {/* Brand */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, paddingRight: 14 }}>
              <img src="/assets/cred_manager.svg" alt="logo" style={{ width: 26, height: 26 }} />
              <div style={{ lineHeight: 1 }}>
                <div style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 14, color: H_TEXT_ACTIVE }}>CredManager</div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,.35)', letterSpacing: '.6px', textTransform: 'uppercase', marginTop: 1 }}>Gravity BP</div>
              </div>
            </div>

            {/* Divider */}
            <div style={{ width: 1, height: 22, background: H_DIVIDER, marginRight: 14, flexShrink: 0 }} />

            {/* Nav */}
            <nav style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, overflow: 'hidden' }}>
              {[...NAV, ...(isAdmin ? NAV_ADMIN : [])].map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '5px 11px', height: 30,
                    borderRadius: 6, textDecoration: 'none', whiteSpace: 'nowrap',
                    fontFamily: "'Google Sans', sans-serif", fontWeight: 500, fontSize: 13,
                    background: isActive ? H_ACTIVE_BG : 'transparent',
                    color: isActive ? H_ACTIVE_TXT : H_TEXT,
                    transition: 'background .12s, color .12s',
                  })}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLAnchorElement
                    if (el.getAttribute('aria-current') !== 'page') {
                      el.style.background = H_HOVER_BG
                    }
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLAnchorElement
                    if (el.getAttribute('aria-current') !== 'page') {
                      el.style.background = 'transparent'
                    }
                  }}
                >
                  <span className="icon" style={{ fontSize: 15 }}>{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </nav>

            {/* Right controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, paddingLeft: 8 }}>
              <SyncButton showToast={showToast} />

              {/* Divider */}
              <div style={{ width: 1, height: 18, background: H_DIVIDER, margin: '0 2px' }} />

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

              {/* Divider + signed-in user pill */}
              <div style={{ width: 1, height: 18, background: H_DIVIDER, margin: '0 2px' }} />
              <UserMenu />

              {/* Spacer so content clears the Electron window control buttons */}
              {isElectron && <div style={{ width: 138, flexShrink: 0 }} />}
            </div>
          </div>
        </header>

        {/* ── Page content ──────────────────────────────────────────────── */}
        <main style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 20px' }}>
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

      <ToastContainer toasts={toasts} onDismiss={id => setToasts(prev => prev.filter(t => t.id !== id))} />
    </ToastContext.Provider>
  )
}

function NotFound() {
  const navigate = useNavigate()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 400, gap: 16 }}>
      <span className="icon" style={{ fontSize: 64, color: 'var(--text-3)', opacity: .3 }}>search_off</span>
      <div style={{ fontSize: 20, fontWeight: 600, fontFamily: "'Google Sans', sans-serif", color: 'var(--text-2)' }}>Page not found</div>
      <button className="md-btn md-btn-tonal" onClick={() => navigate('/')}>Go to Dashboard</button>
    </div>
  )
}
