import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { api } from '../lib/api'
import type { Stats } from '../lib/types'

const STATUS_COLORS: Record<string, string> = {
  Active: '#10b981',
  Inactive: '#f59e0b',
  Expired: '#ef4444',
  Compromised: '#dc2626',
  Archived: '#9ca3af',
}

const PRIORITY_COLORS: Record<string, string> = {
  Critical: '#ef4444',
  High: '#f97316',
  Medium: '#eab308',
  Low: '#10b981',
}

function StatCard({
  label,
  value,
  color,
  sub,
}: {
  label: string
  value: number | string
  color?: string
  sub?: string
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-5 border border-gray-200 dark:border-gray-700">
      <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</div>
      <div
        className="text-3xl font-bold mt-1"
        style={{ color: color ?? 'inherit' }}
      >
        {value}
      </div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  )
}

function AlertCard({
  label,
  value,
  color,
  description,
}: {
  label: string
  value: number
  color: 'red' | 'yellow'
  description: string
}) {
  const colorMap = {
    red: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300',
    yellow:
      'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-300',
  }
  return (
    <div className={`rounded-lg border p-5 ${colorMap[color]}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium opacity-80">{label}</div>
          <div className="text-3xl font-bold mt-1">{value}</div>
          <div className="text-xs opacity-60 mt-1">{description}</div>
        </div>
        <div className="text-4xl opacity-20">{color === 'red' ? '⚠' : '🔔'}</div>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-5 border border-gray-200 dark:border-gray-700 animate-pulse">
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-3" />
      <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
    </div>
  )
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    api
      .getStats()
      .then(setStats)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load stats'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-48 animate-pulse" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
          <strong>Error loading stats:</strong> {error}
        </div>
      </div>
    )
  }

  if (!stats) return null

  const activeCount = stats.by_status['Active'] ?? 0
  const criticalCount = stats.by_priority['Critical'] ?? 0
  const categoryData = stats.by_category.slice(0, 8)
  const tenantData = stats.by_tenant.slice(0, 8).map((t) => ({ name: t.name, count: t.count }))

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Credential overview and security status
          </p>
        </div>
        {stats.pending_sync > 0 && (
          <span className="inline-flex items-center gap-1.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300 px-3 py-1.5 rounded-full text-sm font-medium">
            <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
            {stats.pending_sync} pending sync
          </span>
        )}
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Credentials" value={stats.total_credentials} />
        <StatCard label="Active" value={activeCount} color="#10b981" />
        <StatCard label="Critical Priority" value={criticalCount} color="#ef4444" />
        <StatCard
          label="Expiring (90 days)"
          value={stats.expiring_90d}
          color={stats.expiring_90d > 0 ? '#f59e0b' : undefined}
        />
      </div>

      {/* Alert cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <AlertCard
          label="Expiring Within 30 Days"
          value={stats.expiring_30d}
          color="red"
          description="Credentials expiring soon — action required"
        />
        <AlertCard
          label="No MFA Enabled"
          value={stats.no_mfa}
          color="yellow"
          description="Credentials without multi-factor authentication"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Category */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            Credentials by Category
          </h2>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryData} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  angle={-20}
                  textAnchor="end"
                  height={45}
                />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
              No data
            </div>
          )}
        </div>

        {/* By Tenant */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            Credentials by Tenant
          </h2>
          {tenantData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={tenantData} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  angle={-20}
                  textAnchor="end"
                  height={45}
                />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
              No data
            </div>
          )}
        </div>
      </div>

      {/* Status & Priority breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Status */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            Status Breakdown
          </h2>
          <div className="space-y-2">
            {Object.entries(stats.by_status).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: STATUS_COLORS[status] ?? '#9ca3af' }}
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{status}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (count / (stats.total_credentials || 1)) * 100)}%`,
                        backgroundColor: STATUS_COLORS[status] ?? '#9ca3af',
                      }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100 w-8 text-right">
                    {count}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Priority */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
            Priority Breakdown
          </h2>
          <div className="space-y-2">
            {Object.entries(stats.by_priority).map(([priority, count]) => (
              <div key={priority} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: PRIORITY_COLORS[priority] ?? '#9ca3af' }}
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{priority}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (count / (stats.total_credentials || 1)) * 100)}%`,
                        backgroundColor: PRIORITY_COLORS[priority] ?? '#9ca3af',
                      }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100 w-8 text-right">
                    {count}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Recent Activity
          </h2>
        </div>
        <div className="overflow-x-auto">
          {stats.recent_log.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700/50">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                    Timestamp
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                    Credential
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                    Action
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                    Changed By
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_log.slice(0, 10).map((item) => (
                  <tr
                    key={item.id}
                    className="border-t border-gray-100 dark:border-gray-700 table-row-hover"
                    onClick={() => navigate(`/credential/${item.credential_id}`)}
                  >
                    <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {new Date(item.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-900 dark:text-gray-100">
                        {item.service_name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {item.credential_id}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                          item.action === 'CREATE'
                            ? 'bg-green-100 text-green-800'
                            : item.action === 'DELETE' || item.action === 'ARCHIVE'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {item.action}
                      </span>
                      {item.field_changed && (
                        <span className="ml-1.5 text-xs text-gray-400">{item.field_changed}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">
                      {item.changed_by}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
              No recent activity
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
