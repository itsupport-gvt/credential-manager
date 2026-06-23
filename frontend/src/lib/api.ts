import type {
  Credential,
  CredentialsPage,
  ChangeLogPage,
  Tenant,
  Category,
  Stats,
  SyncStatus,
  AuthUser,
  StaffUser,
} from './types'

// ---------------------------------------------------------------------------
// Per-launch app token (Electron IPC secret)
// ---------------------------------------------------------------------------

let _cachedToken: string | null | undefined = undefined

async function getAppToken(): Promise<string | null> {
  if (_cachedToken !== undefined) return _cachedToken
  try {
    const win = window as Window & { credManager?: { getAppToken?: () => Promise<string> } }
    _cachedToken = (await win.credManager?.getAppToken?.()) ?? null
  } catch {
    _cachedToken = null
  }
  return _cachedToken
}

// ---------------------------------------------------------------------------
// Microsoft ID token (refreshed on each call via silent MSAL acquire)
// Cached for 50 minutes; cleared on 401 so the next call triggers a refresh.
// ---------------------------------------------------------------------------

let _msToken: string | null = null
let _msTokenAt = 0
const _MS_TTL  = 50 * 60 * 1000  // 50 min (ID tokens last 60 min)

export function clearMsToken() {
  _msToken = null
  _msTokenAt = 0
}

async function getMsToken(): Promise<string | null> {
  if (_msToken && Date.now() - _msTokenAt < _MS_TTL) return _msToken
  try {
    const win = window as Window & { credManager?: { getMsToken?: () => Promise<string | null> } }
    const t = (await win.credManager?.getMsToken?.()) ?? null
    _msToken   = t
    _msTokenAt = Date.now()
  } catch {
    _msToken = null
  }
  return _msToken
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const appToken = await getAppToken()
  const msToken  = await getMsToken()
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) }
  if (appToken) headers['X-App-Token']    = appToken
  if (msToken)  headers['Authorization']  = `Bearer ${msToken}`

  const res = await fetch(path, { ...init, headers })

  if (res.status === 401) {
    // Token may have expired; clear cache so next call re-fetches
    clearMsToken()
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}: ${res.statusText}`
    try {
      const body = await res.json()
      if (body?.detail) message = body.detail
      else if (body?.message) message = body.message
    } catch { /* ignore */ }
    throw new Error(message)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export const api = {
  // Credentials
  listCredentials: (params: {
    q?: string; tenant?: string; category?: string
    status?: string; priority?: string; page?: number; page_size?: number
  }) => {
    const s = new URLSearchParams()
    if (params.q) s.set('q', params.q)
    if (params.tenant) s.set('tenant', params.tenant)
    if (params.category) s.set('category', params.category)
    if (params.status) s.set('status', params.status)
    if (params.priority) s.set('priority', params.priority)
    if (params.page != null) s.set('page', String(params.page))
    if (params.page_size != null) s.set('page_size', String(params.page_size))
    const qs = s.toString()
    return req<CredentialsPage>(`/api/credentials${qs ? '?' + qs : ''}`)
  },

  getCredential: (id: string) => req<Credential>(`/api/credential/${id}`),

  createCredential: (data: Partial<Credential> & { password?: string; api_key?: string; api_secret?: string; client_secret?: string }) =>
    req<Credential>('/api/credential/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),

  updateCredential: (id: string, data: Record<string, unknown>) =>
    req<Credential>(`/api/credential/update/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),

  archiveCredential: (id: string) =>
    req<{ success: boolean }>(`/api/credential/archive/${id}`, { method: 'POST' }),

  getSuggestions: () =>
    req<{ service_names: string[]; service_urls: string[]; usernames: string[] }>('/api/suggestions'),

  revealField: (id: string, field: string) =>
    req<{ value: string }>(`/api/credential/${id}/reveal/${field}`),

  logAccess: (id: string, accessedBy: string) =>
    req<{ success: boolean }>(`/api/credential/${id}/log-access`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessed_by: accessedBy }) }),

  // Tenants
  listTenants: () => req<Tenant[]>('/api/tenants'),

  createTenant: (data: Partial<Tenant>) =>
    req<Tenant>('/api/tenant/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),

  updateTenant: (code: string, data: Partial<Tenant>) =>
    req<Tenant>(`/api/tenant/update/${code}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),

  deleteTenant: (code: string) =>
    req<void>(`/api/tenant/${code}`, { method: 'DELETE' }),

  // Categories
  listCategories: () => req<Category[]>('/api/categories'),

  createCategory: (data: { category_name: string; category_code: string; description?: string; subcategories?: string }) =>
    req<Category>('/api/category/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),

  updateCategory: (id: string, data: { category_name?: string; category_code?: string; description?: string; subcategories?: string }) =>
    req<Category>(`/api/category/update/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),

  deleteCategory: (id: string) =>
    req<void>(`/api/category/${id}`, { method: 'DELETE' }),

  // Change Log
  getChangeLog: (params: { credential_id?: string; tenant?: string; action?: string; q?: string; page?: number; page_size?: number }) => {
    const s = new URLSearchParams()
    if (params.credential_id) s.set('credential_id', params.credential_id)
    if (params.tenant) s.set('tenant', params.tenant)
    if (params.action) s.set('action', params.action)
    if (params.q) s.set('q', params.q)
    if (params.page != null) s.set('page', String(params.page))
    if (params.page_size != null) s.set('page_size', String(params.page_size))
    const qs = s.toString()
    return req<ChangeLogPage>(`/api/changelog${qs ? '?' + qs : ''}`)
  },

  exportChangeLogUrl: () => '/api/changelog/export',

  // Stats
  getStats: () => req<Stats>('/api/stats'),

  // Sync
  pushToExcel: () =>
    req<{ pushed_credentials: number; pushed_logs: number }>('/api/sync/push', { method: 'POST' }),

  pullFromExcel: () =>
    req<{ credentials: number; logs: number }>('/api/sync/pull', { method: 'POST' }),

  getSyncStatus: () => req<SyncStatus>('/api/sync/status'),

  // Admin
  resetDb: () => req<{ status: string; deleted_credentials: number; deleted_logs: number; synced: unknown }>('/api/admin/reset-db', { method: 'POST' }),

  // Auth
  getMe: () => req<{ auth_enabled: boolean; user: { oid: string; name: string; email: string; role: string } | null }>('/api/auth/me'),
  listAuthUsers: () => req<AuthUser[]>('/api/auth/users'),
  setUserStatus: (oid: string, is_active: boolean) =>
    req<AuthUser>(`/api/auth/users/${oid}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active }) }),

  // Staff users
  listStaffUsers: () => req<StaffUser[]>('/api/users'),
  createStaffUser: (data: Omit<StaffUser, 'user_id'>) =>
    req<StaffUser>('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  updateStaffUser: (user_id: string, data: Partial<Omit<StaffUser, 'user_id'>>) =>
    req<StaffUser>(`/api/users/${user_id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
  deleteStaffUser: (user_id: string) =>
    req<void>(`/api/users/${user_id}`, { method: 'DELETE' }),
}
