/**
 * auth.ts – Microsoft Entra ID auth context for the React app.
 *
 * Startup flow:
 *   1. AuthProvider mounts → calls window.credManager.getMsUser() (silent MSAL acquire)
 *   2. If a cached token exists → calls /api/auth/me to get the server-verified role
 *   3. If no token → user sees LoginPage
 *   4. LoginPage calls login() → Electron opens system browser → MSAL returns token
 *   5. Auth context updates → main app renders
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  createElement,
  type ReactNode,
} from 'react'
import { api } from './api'
import { clearMsToken } from './api'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AppRole = 'Admin' | 'Editor' | 'Viewer' | 'Auditor'

export interface AuthUserInfo {
  oid: string
  name: string
  email: string
  role: AppRole
}

interface AuthContextValue {
  user: AuthUserInfo | null
  loading: boolean
  authEnabled: boolean
  login: () => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  authEnabled: false,
  login:  async () => ({ ok: false, error: 'Not mounted' }),
  logout: async () => {},
})

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}

// ---------------------------------------------------------------------------
// Electron bridge helpers (safe to call in browser / storybook too)
// ---------------------------------------------------------------------------

type CredManagerBridge = {
  getMsUser?:  () => Promise<{ name: string; email: string; oid: string; token: string } | null>
  getMsToken?: () => Promise<string | null>
  msLogin?:    () => Promise<{ ok: boolean; user?: { name: string; email: string; oid: string; token: string } | null; error?: string }>
  msLogout?:   () => Promise<{ ok: boolean }>
}

function bridge(): CredManagerBridge {
  return ((window as unknown as { credManager?: CredManagerBridge }).credManager) ?? {}
}

// ---------------------------------------------------------------------------
// AuthProvider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,        setUser]        = useState<AuthUserInfo | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [authEnabled, setAuthEnabled] = useState(false)

  // Fetch /api/auth/me using whatever token is currently cached
  const fetchMe = useCallback(async (): Promise<AuthUserInfo | null> => {
    try {
      const resp = await api.getMe()
      setAuthEnabled(resp.auth_enabled)
      if (!resp.auth_enabled) return null          // auth off → anonymous
      if (!resp.user) return null
      return {
        oid:   resp.user.oid,
        name:  resp.user.name,
        email: resp.user.email,
        role:  resp.user.role as AppRole,
      }
    } catch {
      return null
    }
  }, [])

  // Called on mount: try to restore session from MSAL cache
  useEffect(() => {
    (async () => {
      try {
        // Check if Electron has a cached MS user (silent acquire)
        const msUser = await bridge().getMsUser?.()
        if (msUser) {
          // Token is available; verify it with the backend
          const me = await fetchMe()
          setUser(me)
        } else {
          // No cached token → check if backend even requires auth
          const me = await fetchMe()
          setUser(me)        // will be null if auth enabled but no token
        }
      } catch {
        setUser(null)
      } finally {
        setLoading(false)
      }
    })()
  }, [fetchMe])

  const login = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      const result = await bridge().msLogin?.()
      if (!result?.ok) return { ok: false, error: result?.error ?? 'Login cancelled' }
      // Token is now cached in MSAL; verify with backend
      const me = await fetchMe()
      setUser(me)
      return me ? { ok: true } : { ok: false, error: 'Role not assigned — contact your administrator.' }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }, [fetchMe])

  const logout = useCallback(async () => {
    await bridge().msLogout?.()
    clearMsToken()
    setUser(null)
    setAuthEnabled(false)
    // Re-check (auth may still be enabled, just no user now)
    const me = await fetchMe()
    setAuthEnabled(me === null && authEnabled)
    setUser(null)
  }, [fetchMe, authEnabled])

  return createElement(
    AuthContext.Provider,
    { value: { user, loading, authEnabled, login, logout } },
    children,
  )
}
