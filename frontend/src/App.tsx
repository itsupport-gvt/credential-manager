import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import { api } from './lib/api'
import DashboardPage from './pages/DashboardPage'
import CredentialsPage from './pages/CredentialsPage'
import CredentialDetailPage from './pages/CredentialDetailPage'
import NewCredentialPage from './pages/NewCredentialPage'
import EditCredentialPage from './pages/EditCredentialPage'
import ChangeLogPage from './pages/ChangeLogPage'
import TenantsPage from './pages/TenantsPage'
import CategoriesPage from './pages/CategoriesPage'
import SettingsPage from './pages/SettingsPage'

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
    <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 380 }}>
      {toasts.map((t) => (
        <div key={t.id} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
          borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,.18)',
          background: t.type === 'success' ? '#188038' : t.type === 'error' ? '#d93025' : '#202124',
          color: '#fff', fontSize: 14, fontFamily: "'Google Sans', sans-serif", fontWeight: 500,
          animation: 'fadeIn .25s ease',
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

// ── Sync dropdown ────────────────────────────────────────────────────────────

function SyncDropdown({ showToast }: { showToast: (msg: string, type?: ToastType) => void }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(0)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetch = () => api.getSyncStatus().then(s => setPending(s.pending_credentials + s.pending_logs)).catch(() => {})
    fetch()
    const t = setInterval(fetch, 60_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
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

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={busy}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
          border: '1px solid var(--border)', borderRadius: 20, cursor: 'pointer',
          background: pending > 0 ? 'var(--warn-bg)' : 'var(--surface)',
          color: pending > 0 ? '#b06000' : 'var(--text-2)',
          fontSize: 13, fontFamily: "'Google Sans', sans-serif", fontWeight: 500,
          transition: 'background .15s',
        }}
      >
        <span className="icon icon-sm" style={{ animation: busy ? 'spin .8s linear infinite' : 'none' }}>sync</span>
        Sync
        {pending > 0 && !busy && (
          <span style={{ background: 'var(--warn)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>{pending}</span>
        )}
        <span className="icon icon-sm">expand_more</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)', minWidth: 200, zIndex: 100,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
          boxShadow: 'var(--shadow-3)', overflow: 'hidden',
        }}>
          {[
            { label: 'Push to SharePoint', icon: 'upload', action: 'push' as const },
            { label: 'Pull from SharePoint', icon: 'download', action: 'pull' as const },
            { label: 'Push & Pull', icon: 'sync', action: 'both' as const },
          ].map(item => (
            <button key={item.action} onClick={() => doSync(item.action)} style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%',
              padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 14, color: 'var(--text-1)', textAlign: 'left',
              transition: 'background .1s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <span className="icon icon-sm" style={{ color: 'var(--primary)' }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Nav items ────────────────────────────────────────────────────────────────

const NAV: { to: string; end?: boolean; label: string; icon: string }[] = [
  { to: '/', end: true, label: 'Dashboard', icon: 'dashboard' },
  { to: '/credentials', label: 'Credentials', icon: 'lock' },
  { to: '/changelog', label: 'Activity', icon: 'history' },
  { to: '/tenants', label: 'Tenants', icon: 'business' },
  { to: '/categories', label: 'Categories', icon: 'category' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

// ── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++toastCounter
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Top app bar */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 50,
          background: 'var(--surface)', borderBottom: '1px solid var(--border)',
          boxShadow: 'var(--shadow-1)',
        }}>
          <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', gap: 0, height: 60 }}>
            {/* Brand */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 32, flexShrink: 0 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 10,
                background: 'linear-gradient(135deg, var(--primary) 0%, #0d47a1 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span className="icon icon-sm" style={{ color: '#fff' }}>lock</span>
              </div>
              <div>
                <div style={{ fontFamily: "'Google Sans', sans-serif", fontWeight: 700, fontSize: 15, color: 'var(--text-1)', lineHeight: 1.2 }}>CredManager</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '.5px', textTransform: 'uppercase' }}>Gravity BP</div>
              </div>
            </div>

            {/* Nav */}
            <nav style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 1, overflow: 'auto' }}>
              {NAV.map(item => (
                <NavLink key={item.to} to={item.to} end={item.end}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                    borderRadius: 20, textDecoration: 'none', whiteSpace: 'nowrap',
                    fontFamily: "'Google Sans', sans-serif", fontWeight: 500, fontSize: 14,
                    background: isActive ? 'var(--primary-bg)' : 'transparent',
                    color: isActive ? 'var(--primary)' : 'var(--text-2)',
                    transition: 'background .15s, color .15s',
                  })}
                >
                  <span className="icon icon-sm">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </nav>

            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <SyncDropdown showToast={showToast} />
            </div>
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 24px' }}>
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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 400, gap: 16, color: 'var(--text-3)' }}>
      <span className="icon" style={{ fontSize: 64, opacity: .2 }}>search_off</span>
      <div style={{ fontSize: 20, fontWeight: 600, fontFamily: "'Google Sans', sans-serif", color: 'var(--text-2)' }}>Page not found</div>
      <button className="md-btn md-btn-tonal" onClick={() => navigate('/')}>Go to Dashboard</button>
    </div>
  )
}
