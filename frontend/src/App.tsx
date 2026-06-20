import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import { api } from './lib/api'
import DashboardPage from './pages/DashboardPage'
import CredentialsPage from './pages/CredentialsPage'
import CredentialDetailPage from './pages/CredentialDetailPage'
import NewCredentialPage from './pages/NewCredentialPage'
import EditCredentialPage from './pages/EditCredentialPage'
import ChangeLogPage from './pages/ChangeLogPage'
import TenantsPage from './pages/TenantsPage'
import SettingsPage from './pages/SettingsPage'

// ── Toast system ────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'info'

interface Toast {
  id: number
  type: ToastType
  message: string
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

let toastCounter = 0

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all ${
            toast.type === 'success'
              ? 'bg-green-600 text-white'
              : toast.type === 'error'
                ? 'bg-red-600 text-white'
                : 'bg-gray-800 text-white'
          }`}
        >
          <span className="text-lg flex-shrink-0">
            {toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : 'ℹ'}
          </span>
          <span className="flex-1">{toast.message}</span>
          <button
            onClick={() => onDismiss(toast.id)}
            className="opacity-70 hover:opacity-100 flex-shrink-0"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}

// ── Sync Button ─────────────────────────────────────────────────────────────

function SyncButton({ showToast }: { showToast: (msg: string, type?: ToastType) => void }) {
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    api.getSyncStatus()
      .then((s) => setPending(s.pending_credentials + s.pending_logs))
      .catch(() => {})
    const timer = setInterval(() => {
      api.getSyncStatus()
        .then((s) => setPending(s.pending_credentials + s.pending_logs))
        .catch(() => {})
    }, 60_000)
    return () => clearInterval(timer)
  }, [])

  async function handleSync() {
    setSyncing(true)
    try {
      await api.pushToExcel()
      const pull = await api.pullFromExcel()
      showToast(`Sync complete: pulled ${pull.credentials} credentials`, 'success')
      const s = await api.getSyncStatus()
      setPending(s.pending_credentials + s.pending_logs)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Sync failed', 'error')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <button
      onClick={handleSync}
      disabled={syncing}
      className="relative flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors disabled:opacity-50"
      title="Sync with SharePoint"
    >
      <span className={syncing ? 'animate-spin' : ''}>⟳</span>
      <span>Sync</span>
      {pending > 0 && !syncing && (
        <span className="ml-auto bg-yellow-500 text-gray-900 text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
          {pending}
        </span>
      )}
    </button>
  )
}

// ── Nav links ────────────────────────────────────────────────────────────────

interface NavItem {
  to: string
  label: string
  icon: string
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: '⊞' },
  { to: '/credentials', label: 'Credentials', icon: '🔐' },
  { to: '/changelog', label: 'Change Log', icon: '📋' },
  { to: '/tenants', label: 'Tenants', icon: '🏢' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
]

// ── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('cm_theme')
    return stored === 'dark' ? 'dark' : 'light'
  })

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('cm_theme', theme)
    if (window.credManager?.setTheme) {
      window.credManager.setTheme(theme)
    }
  }, [theme])

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++toastCounter
    setToasts((prev) => [...prev, { id, type, message }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }, [])

  function dismissToast(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  function toggleTheme() {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'))
  }

  return (
    <ToastContext.Provider value={{ showToast }}>
      <div className="flex h-full bg-gray-50 dark:bg-gray-900">
        {/* Sidebar */}
        <aside
          className="w-56 flex-shrink-0 flex flex-col h-full overflow-y-auto"
          style={{ backgroundColor: 'var(--color-sidebar-bg)' }}
        >
          {/* Logo */}
          <div className="px-4 py-5 border-b border-gray-800">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gray-700 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                CM
              </div>
              <div className="min-w-0">
                <div className="text-white text-sm font-semibold truncate">Credential Manager</div>
                <div className="text-gray-400 text-xs truncate">Gravity BP</div>
              </div>
            </div>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-2 py-4 space-y-0.5">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `sidebar-link flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
                    isActive
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`
                }
              >
                <span className="text-base w-5 text-center flex-shrink-0">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Bottom controls */}
          <div className="px-2 py-4 border-t border-gray-800 space-y-0.5">
            <SyncButton showToast={showToast} />

            <button
              onClick={toggleTheme}
              className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
              title="Toggle theme"
            >
              <span>{theme === 'dark' ? '☀' : '☾'}</span>
              <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/credentials" element={<CredentialsPage />} />
            <Route path="/credential/new" element={<NewCredentialPage />} />
            <Route path="/credential/:id" element={<CredentialDetailPage />} />
            <Route path="/credential/:id/edit" element={<EditCredentialPage />} />
            <Route path="/changelog" element={<ChangeLogPage />} />
            <Route path="/tenants" element={<TenantsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>

        {/* Toasts */}
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    </ToastContext.Provider>
  )
}

function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500 dark:text-gray-400">
      <div className="text-6xl opacity-30">404</div>
      <h1 className="text-xl font-semibold">Page Not Found</h1>
      <button
        onClick={() => navigate('/')}
        className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-sm font-medium hover:bg-gray-700"
      >
        Go to Dashboard
      </button>
    </div>
  )
}
