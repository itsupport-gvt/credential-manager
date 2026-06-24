import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { Stats } from '../lib/types'

const STATUS_BARS: Record<string, string> = {
  Active: 'bg-emerald-500', 
  Inactive: 'bg-amber-500', 
  Expired: 'bg-red-500', 
  Compromised: 'bg-rose-600', 
  Archived: 'bg-slate-500',
}

const PRIORITY_COLORS: Record<string, string> = {
  Critical: 'bg-red-500', 
  High: 'bg-orange-500', 
  Medium: 'bg-blue-500', 
  Low: 'bg-emerald-500',
}

function KpiCard({ icon, label, value, colorClass = "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10", sub }: { icon: string; label: string; value: number | string; colorClass?: string; sub?: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 p-5 shadow-sm hover:shadow-md transition-all duration-300 group">
      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity duration-300 pointer-events-none transform translate-x-4 -translate-y-4 group-hover:scale-110">
        <span className="material-icons-round text-8xl">{icon}</span>
      </div>
      <div className="flex items-start gap-4 relative z-10">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-inner ${colorClass}`}>
          <span className="material-icons-round text-2xl">{icon}</span>
        </div>
        <div className="flex-1">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider font-sans">{label}</div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white mt-1 tabular-nums tracking-tight">{value}</div>
          {sub && <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">{sub}</div>}
        </div>
      </div>
    </div>
  )
}

function AlertCard({ icon, label, value, bgClass, textClass, desc }: { icon: string; label: string; value: number; bgClass: string; textClass: string; desc: string }) {
  return (
    <div className={`rounded-2xl border ${bgClass} p-5 transition-transform hover:-translate-y-1 duration-300 shadow-sm`}>
      <div className="flex items-start justify-between">
        <div>
          <div className={`text-xs font-bold uppercase tracking-wider font-sans ${textClass} opacity-90`}>{label}</div>
          <div className={`text-4xl font-extrabold tabular-nums tracking-tight mt-1 ${textClass}`}>{value}</div>
          <div className={`text-sm mt-1.5 font-medium ${textClass} opacity-80`}>{desc}</div>
        </div>
        <div className={`p-3 rounded-full bg-white/20 dark:bg-black/10 backdrop-blur-sm ${textClass}`}>
          <span className="material-icons-round text-3xl">{icon}</span>
        </div>
      </div>
    </div>
  )
}

function ListSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 p-6 shadow-sm flex flex-col h-full">
      <div className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider font-sans mb-5 pb-3 border-b border-slate-100 dark:border-slate-700/50">
        {title}
      </div>
      <div className="flex-1 flex flex-col gap-3">
        {children}
      </div>
    </div>
  )
}

function DataRow({ label, count, total, barColor, suffix = '' }: { label: string; count: number; total: number; barColor: string; suffix?: string }) {
  const pct = total > 0 ? Math.min(100, (count / total) * 100) : 0
  return (
    <div className="group flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{label}</div>
      </div>
      <div className="w-32 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden flex-shrink-0 relative">
        <div 
          className={`absolute top-0 left-0 h-full rounded-full ${barColor} transition-all duration-1000 ease-out`}
          style={{ width: `${pct}%` }} 
        />
      </div>
      <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums w-12 text-right">
        {count}{suffix}
      </div>
    </div>
  )
}

function actionBadgeClass(action: string) {
  const map: Record<string, string> = { 
    CREATE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/30', 
    DELETE: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 border-red-200 dark:border-red-500/30', 
    ARCHIVE: 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400 border-orange-200 dark:border-orange-500/30', 
    REVEAL: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400 border-purple-200 dark:border-purple-500/30', 
    ACCESS: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 border-blue-200 dark:border-blue-500/30' 
  }
  return map[action] ?? 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600'
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    api.getStats().then(setStats).catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed')).finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="grid grid-cols-4 gap-6 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-white dark:bg-slate-800 p-6 border border-slate-100 dark:border-slate-700">
          <div className="h-12 w-12 bg-slate-200 dark:bg-slate-700 rounded-xl mb-4" />
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2 mb-2" />
          <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-3/4" />
        </div>
      ))}
    </div>
  )

  if (error) return (
    <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-500/30 p-4 text-red-700 dark:text-red-400 font-medium flex items-center gap-3">
      <span className="material-icons-round">error_outline</span>
      {error}
    </div>
  )
  
  if (!stats) return null

  const active = stats.by_status['Active'] ?? 0
  const critical = stats.by_priority['Critical'] ?? 0
  
  // Sort data for clean lists
  const catData = [...stats.by_category].sort((a, b) => b.count - a.count).slice(0, 6)
  const tenantData = [...stats.by_tenant].sort((a, b) => b.count - a.count).slice(0, 6)

  return (
    <div className="flex flex-col gap-8 max-w-7xl mx-auto pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Dashboard</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">Security overview and credential metrics</p>
        </div>
        {stats.pending_sync > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 rounded-full font-semibold text-sm shadow-sm">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            {stats.pending_sync} pending sync
          </div>
        )}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <KpiCard icon="password" label="Total Credentials" value={stats.total_credentials} colorClass="text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20" />
        <KpiCard icon="check_circle" label="Active" value={active} colorClass="text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20" />
        <KpiCard icon="priority_high" label="Critical Priority" value={critical} colorClass="text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-500/10 border border-rose-100 dark:border-rose-500/20" />
        <KpiCard icon="schedule" label="Expiring 90 Days" value={stats.expiring_90d} colorClass={stats.expiring_90d > 0 ? "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20" : "text-slate-600 bg-slate-50 dark:text-slate-400 dark:bg-slate-500/10"} />
      </div>

      {/* Alert row */}
      {(stats.expiring_30d > 0 || stats.no_mfa > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {stats.expiring_30d > 0 && (
            <AlertCard 
              icon="warning" 
              label="Expiring Within 30 Days" 
              value={stats.expiring_30d} 
              bgClass="bg-gradient-to-br from-rose-50 to-red-50 dark:from-rose-950/40 dark:to-red-900/40 border-rose-200 dark:border-rose-800/50" 
              textClass="text-rose-700 dark:text-rose-300" 
              desc="Credentials expiring soon — action required" 
            />
          )}
          {stats.no_mfa > 0 && (
            <AlertCard 
              icon="notifications_active" 
              label="No MFA Enabled" 
              value={stats.no_mfa} 
              bgClass="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-900/40 border-amber-200 dark:border-amber-800/50" 
              textClass="text-amber-700 dark:text-amber-300" 
              desc="Credentials without multi-factor authentication" 
            />
          )}
        </div>
      )}

      {/* Analytical Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ListSection title="Top Categories">
          {catData.length > 0 ? catData.map((c, i) => (
            <DataRow key={i} label={c.name} count={c.count} total={stats.total_credentials} barColor="bg-indigo-500" />
          )) : <div className="text-slate-400 text-sm italic py-4 text-center">No categories found</div>}
        </ListSection>

        <ListSection title="Top Tenants">
          {tenantData.length > 0 ? tenantData.map((t, i) => (
            <DataRow key={i} label={t.name || t.code} count={t.count} total={stats.total_credentials} barColor="bg-blue-500" />
          )) : <div className="text-slate-400 text-sm italic py-4 text-center">No tenants found</div>}
        </ListSection>
      </div>

      {/* Status & Priority */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ListSection title="Status Breakdown">
          {Object.entries(stats.by_status).sort((a,b) => b[1] - a[1]).map(([s, c]) => (
            <DataRow key={s} label={s} count={c} total={stats.total_credentials} barColor={STATUS_BARS[s] ?? 'bg-slate-400'} />
          ))}
        </ListSection>
        <ListSection title="Priority Breakdown">
          {Object.entries(stats.by_priority).sort((a,b) => b[1] - a[1]).map(([p, c]) => (
            <DataRow key={p} label={p} count={c} total={stats.total_credentials} barColor={PRIORITY_COLORS[p] ?? 'bg-slate-400'} />
          ))}
        </ListSection>
      </div>

      {/* Recent Activity */}
      <div className="rounded-2xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-100 dark:border-slate-700/50 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/20">
          <h3 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-sm font-sans">Recent Activity</h3>
          <button 
            className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors flex items-center gap-1" 
            onClick={() => navigate('/changelog')}
          >
            View All
            <span className="material-icons-round text-sm">arrow_forward</span>
          </button>
        </div>
        
        {stats.recent_log.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700/50">
                  <th className="py-3 px-5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Time</th>
                  <th className="py-3 px-5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Target</th>
                  <th className="py-3 px-5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Action</th>
                  <th className="py-3 px-5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right">User</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                {stats.recent_log.slice(0, 8).map((item) => (
                  <tr 
                    key={item.id} 
                    className="group hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition-colors cursor-pointer"
                    onClick={() => navigate(`/credential/${item.credential_id}`)}
                  >
                    <td className="py-3 px-5 whitespace-nowrap">
                      <div className="text-sm text-slate-600 dark:text-slate-400 tabular-nums">
                        {new Date(item.timestamp).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="py-3 px-5">
                      <div className="font-semibold text-slate-800 dark:text-slate-200 text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {item.service_name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                        {item.credential_id}
                      </div>
                    </td>
                    <td className="py-3 px-5">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${actionBadgeClass(item.action)}`}>
                          {item.action}
                        </span>
                        {item.field_changed && (
                          <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            {item.field_changed}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-5 text-right text-sm font-medium text-slate-600 dark:text-slate-400">
                      {item.changed_by}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center text-slate-500 dark:text-slate-400 text-sm font-medium">
            <span className="material-icons-round text-4xl block mb-2 opacity-50">history</span>
            No recent activity recorded
          </div>
        )}
      </div>
    </div>
  )
}

