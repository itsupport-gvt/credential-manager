import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { ChangeLogItem, Tenant } from '../lib/types'

const PAGE_SIZE = 50

const ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'ARCHIVE', 'REVEAL', 'ACCESS']

function SkeletonRow() {
  return (
    <tr className="border-t border-gray-100 dark:border-gray-700 animate-pulse">
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
        </td>
      ))}
    </tr>
  )
}

export default function ChangeLogPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<ChangeLogItem[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tenants, setTenants] = useState<Tenant[]>([])

  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterTenant, setFilterTenant] = useState('')
  const [page, setPage] = useState(1)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    debounceRef.current && clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query)
      setPage(1)
    }, 300)
    return () => { debounceRef.current && clearTimeout(debounceRef.current) }
  }, [query])

  useEffect(() => {
    api.listTenants().then(setTenants).catch(() => {})
  }, [])

  const fetchLog = useCallback(() => {
    setLoading(true)
    setError(null)
    api
      .getChangeLog({
        q: debouncedQuery || undefined,
        tenant: filterTenant || undefined,
        action: filterAction || undefined,
        page,
        page_size: PAGE_SIZE,
      })
      .then((data) => {
        setItems(data.items)
        setTotal(data.total)
        setTotalPages(data.pages)
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Failed to load change log'),
      )
      .finally(() => setLoading(false))
  }, [debouncedQuery, filterTenant, filterAction, page])

  useEffect(() => {
    fetchLog()
  }, [fetchLog])

  function actionBadgeClass(action: string) {
    if (action === 'CREATE') return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
    if (action === 'DELETE' || action === 'ARCHIVE') return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
    if (action === 'REVEAL' || action === 'ACCESS') return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
    return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Change Log</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {total} log entries
          </p>
        </div>
        <a
          href={api.exportChangeLogUrl()}
          download
          className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          Export CSV ↓
        </a>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="Search log entries…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <select
            value={filterAction}
            onChange={(e) => { setFilterAction(e.target.value); setPage(1) }}
            className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Actions</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>

          <select
            value={filterTenant}
            onChange={(e) => { setFilterTenant(e.target.value); setPage(1) }}
            className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Tenants</option>
            {tenants.map((t) => (
              <option key={t.tenant_code} value={t.tenant_code}>{t.tenant_name}</option>
            ))}
          </select>
        </div>
      </div>

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
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">
                  Log ID
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">
                  Timestamp
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">
                  Credential
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Service
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Tenant
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Action
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Field Changed
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap">
                  Changed By
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => <SkeletonRow key={i} />)
              ) : items.length > 0 ? (
                items.map((item) => (
                  <tr
                    key={item.id}
                    className="border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                      {item.log_id}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap text-xs">
                      {new Date(item.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(`/credential/${item.credential_id}`)}
                        className="font-mono text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {item.credential_id}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 max-w-[140px] truncate">
                      {item.service_name}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs">
                      {item.tenant_code}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${actionBadgeClass(item.action)}`}>
                        {item.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {item.field_changed && (
                        <div>
                          <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
                            {item.field_changed}
                          </div>
                          {(item.old_value_masked || item.new_value_masked) && (
                            <div className="text-xs text-gray-400 font-mono mt-0.5">
                              {item.old_value_masked && (
                                <span className="text-red-500">{item.old_value_masked}</span>
                              )}
                              {item.old_value_masked && item.new_value_masked && (
                                <span className="mx-1 text-gray-300">→</span>
                              )}
                              {item.new_value_masked && (
                                <span className="text-green-600">{item.new_value_masked}</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap text-xs">
                      <div>{item.changed_by}</div>
                      {item.reason && (
                        <div className="text-gray-400 truncate max-w-[120px]" title={item.reason}>
                          {item.reason}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-gray-400 text-sm">
                    No log entries found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Page {page} of {totalPages} &middot; {total} total
            </div>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-600"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-600"
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
