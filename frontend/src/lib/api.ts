import type {
  Credential,
  CredentialsPage,
  ChangeLogPage,
  Tenant,
  Category,
  Stats,
  SyncStatus,
} from './types'

// ---------------------------------------------------------------------------
// Per-launch app token
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

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getAppToken()
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) }
  if (token) headers['X-App-Token'] = token
  const res = await fetch(path, { ...init, headers })
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
}
