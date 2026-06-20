import { useEffect, useState, useCallback, useRef, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { Credential, CredentialsPage as CredentialsPageData, Tenant, Category } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'
import { PriorityBadge } from '../components/PriorityBadge'

const PAGE_SIZE = 50

const STATUSES = ['Active', 'Inactive', 'Expired', 'Compromised', 'Archived']
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low']

function SkeletonRow() {
  return (
    <tr className="border-t border-gray-100 dark:border-gray-700 animate-pulse">
      {Array.from({ length: 9 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
        </td>
      ))}
    </tr>
  )
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      onClick={handleCopy}
      className="opacity-0 group-hover:opacity-100 ml-1.5 text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-opacity"
      title="Copy username"
    >
      {copied ? '✓' : '⎘'}
    </button>
  )
}

export default function CredentialsPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<CredentialsPageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [filterTenant, setFilterTenant] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [page, setPage] = useState(1)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    debounceRef.current && clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query)
      setPage(1)
    }, 300)
    return () => {
      debounceRef.current && clearTimeout(debounceRef.current)
    }
  }, [query])

  useEffect(() => {
    api.listTenants().then(setTenants).catch(() => {})
    api.listCategories().then(setCategories).catch(() => {})
  }, [])

  const fetchCredentials = useCallback(() => {
    setLoading(true)
    setError(null)
    api
      .listCredentials({
        q: debouncedQuery || undefined,
        tenant: filterTenant || undefined,
        category: filterCategory || undefined,
        status: filterStatus || undefined,
        priority: filterPriority || undefined,
        page,
        page_size: PAGE_SIZE,
      })
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load credentials'),
      )
      .finally(() => setLoading(false))
  }, [debouncedQuery, filterTenant, filterCategory, filterStatus, filterPriority, page])

  useEffect(() => {
    fetchCredentials()
  }, [fetchCredentials])

  function handleFilterChange() {
    setPage(1)
  }

  const totalPages = data ? data.pages : 1

  function formatDate(d: string) {
    if (!d) return '—'
    try {
      return new Date(d).toLocaleDateString()
    } catch {
      return d
    }
  }

  function isExpired(d: string) {
    if (!d) return false
    try {
      return new Date(d) < new Date()
    } catch {
      return false
    }
  }

  function isExpiringSoon(d: string) {
    if (!d) return false
    try {
      const diff = new Date(d).getTime() - Date.now()
      return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000
    } catch {
      return false
    }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Credentials</h1>
          {data && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {data.total} credential{data.total !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <button
          onClick={() => navigate('/credential/new')}
          className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors"
        >
          + New Credential
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-1">
            <input
              type="text"
              placeholder="Search service, tenant, username…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={filterTenant}
            onChange={(e) => {
              setFilterTenant(e.target.value)
              handleFilterChange()
            }}
            className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Tenants</option>
            {tenants.map((t) => (
              <option key={t.tenant_code} value={t.tenant_code}>
                {t.tenant_name}
              </option>
            ))}
          </select>

          <select
            value={filterCategory}
            onChange={(e) => {
              setFilterCategory(e.target.value)
              handleFilterChange()
            }}
            className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.category_id} value={c.category_name}>
                {c.category_name}
              </option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value)
              handleFilterChange()
            }}
            className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={filterPriority}
            onChange={(e) => {
              setFilterPriority(e.target.value)
              handleFilterChange()
            }}
            className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Priorities</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-700/50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Credential ID
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Service
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Tenant
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Category
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Username
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Priority
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Expiry
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  MFA
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              ) : data && data.items.length > 0 ? (
                data.items.map((cred: Credential) => (
                  <tr
                    key={cred.id}
                    className="border-t border-gray-100 dark:border-gray-700 table-row-hover group"
                    onClick={() => navigate(`/credential/${cred.credential_id}`)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                      {cred.credential_id}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        {cred.service_name}
                      </div>
                      {cred.environment && (
                        <div className="text-xs text-gray-400">{cred.environment}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      <div className="font-medium">{cred.tenant_code}</div>
                      {cred.tenant_name && (
                        <div className="text-xs text-gray-400">{cred.tenant_name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                      {cred.category}
                      {cred.subcategory && (
                        <div className="text-xs text-gray-400">{cred.subcategory}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      <div className="flex items-center">
                        <span className="truncate max-w-[160px]">{cred.username_email || '—'}</span>
                        {cred.username_email && <CopyButton value={cred.username_email} />}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={cred.status} />
                    </td>
                    <td className="px-4 py-3">
                      <PriorityBadge priority={cred.priority} />
                    </td>
                    <td className="px-4 py-3">
                      {cred.password_expiry_date ? (
                        <span
                          className={`text-sm ${
                            isExpired(cred.password_expiry_date)
                              ? 'text-red-600 dark:text-red-400 font-medium'
                              : isExpiringSoon(cred.password_expiry_date)
                                ? 'text-yellow-600 dark:text-yellow-400 font-medium'
                                : 'text-gray-600 dark:text-gray-400'
                          }`}
                        >
                          {formatDate(cred.password_expiry_date)}
                        </span>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {cred.mfa_enabled === 'Yes' ? (
                        <span className="text-green-600 dark:text-green-400 font-medium text-xs">
                          ✓ Yes
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">No</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-gray-400 dark:text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-4xl opacity-30">🔐</span>
                      <span className="text-sm">No credentials found</span>
                      {(query || filterTenant || filterCategory || filterStatus || filterPriority) && (
                        <button
                          onClick={() => {
                            setQuery('')
                            setFilterTenant('')
                            setFilterCategory('')
                            setFilterStatus('')
                            setFilterPriority('')
                            setPage(1)
                          }}
                          className="text-xs text-blue-500 hover:underline"
                        >
                          Clear filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Page {page} of {totalPages} &middot; {data.total} total
            </div>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
