import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { api } from '../lib/api'
import type { Stats } from '../lib/types'

const STATUS_COLORS: Record<string, string> = {
  Active: '#188038', Inactive: '#f29900', Expired: '#d93025', Compromised: '#b71c1c', Archived: '#80868b',
}
const PRIORITY_COLORS: Record<string, string> = {
  Critical: '#d93025', High: '#e8710a', Medium: '#1a73e8', Low: '#188038',
}

function KpiCard({ icon, label, value, color, sub }: { icon: string; label: string; value: number | string; color?: string; sub?: string }) {
  return (
    <div className="md-card" style={{ padding: '20px 24px', display: 'flex', alignItems: 'flex-start', gap: 16 }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: color ? color + '18' : 'var(--primary-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span className="icon icon-lg" style={{ color: color ?? 'var(--primary)' }}>{icon}</span>
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)', fontFamily: "'Google Sans', sans-serif", textTransform: 'uppercase', letterSpacing: .6 }}>{label}</div>
        <div style={{ fontSize: 28, fontWeight: 700, fontFamily: "'Google Sans', sans-serif", color: color ?? 'var(--text-1)', lineHeight: 1.2, marginTop: 2 }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  )
}

function AlertCard({ icon, label, value, bg, fg, desc }: { icon: string; label: string; value: number; bg: string; fg: string; desc: string }) {
  return (
    <div style={{ background: bg, border: `1px solid ${fg}30`, borderRadius: 12, padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 500, color: fg, textTransform: 'uppercase', letterSpacing: .6, fontFamily: "'Google Sans', sans-serif" }}>{label}</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: fg, fontFamily: "'Google Sans', sans-serif", lineHeight: 1.1, marginTop: 4 }}>{value}</div>
          <div style={{ fontSize: 12, color: fg, opacity: .7, marginTop: 4 }}>{desc}</div>
        </div>
        <span className="icon" style={{ fontSize: 40, color: fg, opacity: .15 }}>{icon}</span>
      </div>
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="md-card" style={{ padding: '20px 24px' }}>
      <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "'Google Sans', sans-serif", color: 'var(--text-1)', marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  )
}

function BarRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.min(100, (count / total) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: 13, color: 'var(--text-1)' }}>{label}</div>
      <div style={{ width: 100, height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', width: 28, textAlign: 'right' }}>{count}</div>
    </div>
  )
}

function actionBadge(action: string) {
  const map: Record<string, string> = { CREATE: 'badge-active', DELETE: 'badge-danger', ARCHIVE: 'badge-danger', REVEAL: 'badge-purple', ACCESS: 'badge-purple' }
  return map[action] ?? 'badge-blue'
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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="md-card" style={{ padding: 24, animation: 'pulse 1.5s infinite' }}>
          <div style={{ height: 12, background: 'var(--surface-2)', borderRadius: 6, width: '60%', marginBottom: 12 }} />
          <div style={{ height: 28, background: 'var(--surface-2)', borderRadius: 6, width: '40%' }} />
        </div>
      ))}
    </div>
  )

  if (error) return <div style={{ background: 'var(--danger-bg)', border: '1px solid #f5c6c3', color: 'var(--danger)', padding: '12px 16px', borderRadius: 10, fontSize: 14 }}>{error}</div>
  if (!stats) return null

  const active = stats.by_status['Active'] ?? 0
  const critical = stats.by_priority['Critical'] ?? 0
  const catData = stats.by_category.slice(0, 10)
  const tenantData = stats.by_tenant.slice(0, 10).map(t => ({ name: t.name || t.code, count: t.count }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">Credential overview and security status</div>
        </div>
        {stats.pending_sync > 0 && (
          <span className="badge-warn" style={{ padding: '6px 14px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#f29900', display: 'inline-block', animation: 'pulse 1.2s infinite' }} />
            {stats.pending_sync} pending sync
          </span>
        )}
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
        <KpiCard icon="password" label="Total Credentials" value={stats.total_credentials} />
        <KpiCard icon="check_circle" label="Active" value={active} color="#188038" />
        <KpiCard icon="priority_high" label="Critical Priority" value={critical} color="#d93025" />
        <KpiCard icon="schedule" label="Expiring 90 Days" value={stats.expiring_90d} color={stats.expiring_90d > 0 ? '#f29900' : undefined} />
      </div>

      {/* Alert row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <AlertCard icon="warning" label="Expiring Within 30 Days" value={stats.expiring_30d} bg="var(--danger-bg)" fg="var(--danger)" desc="Credentials expiring soon — action required" />
        <AlertCard icon="notifications_active" label="No MFA Enabled" value={stats.no_mfa} bg="var(--warn-bg)" fg="#b06000" desc="Credentials without multi-factor authentication" />
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <ChartCard title="Credentials by Category">
          {catData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={catData} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-2)' }} angle={-20} textAnchor="end" height={46} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-2)' }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }} />
                <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13 }}>No data</div>}
        </ChartCard>
        <ChartCard title="Credentials by Tenant">
          {tenantData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={tenantData} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-2)' }} angle={-20} textAnchor="end" height={46} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-2)' }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }} />
                <Bar dataKey="count" fill="#0d47a1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13 }}>No data</div>}
        </ChartCard>
      </div>

      {/* Status & Priority */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <ChartCard title="Status Breakdown">
          {Object.entries(stats.by_status).map(([s, c]) => (
            <BarRow key={s} label={s} count={c} total={stats.total_credentials} color={STATUS_COLORS[s] ?? '#80868b'} />
          ))}
        </ChartCard>
        <ChartCard title="Priority Breakdown">
          {Object.entries(stats.by_priority).map(([p, c]) => (
            <BarRow key={p} label={p} count={c} total={stats.total_credentials} color={PRIORITY_COLORS[p] ?? '#80868b'} />
          ))}
        </ChartCard>
      </div>

      {/* Recent Activity */}
      <div className="md-card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 600, fontFamily: "'Google Sans', sans-serif", fontSize: 14, color: 'var(--text-1)' }}>Recent Activity</div>
          <button className="md-btn md-btn-outlined" style={{ padding: '4px 14px', fontSize: 12 }} onClick={() => navigate('/changelog')}>View All</button>
        </div>
        {stats.recent_log.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                {['Timestamp', 'Service', 'Action', 'Changed By'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 16px', fontSize: 11, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: .5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.recent_log.slice(0, 10).map(item => (
                <tr key={item.id} className="md-row" style={{ borderTop: '1px solid var(--border)' }} onClick={() => navigate(`/credential/${item.credential_id}`)}>
                  <td style={{ padding: '10px 16px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{new Date(item.timestamp).toLocaleString()}</td>
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ fontWeight: 500, color: 'var(--text-1)' }}>{item.service_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace' }}>{item.credential_id}</div>
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <span className={actionBadge(item.action)}>{item.action}</span>
                    {item.field_changed && <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 6 }}>{item.field_changed}</span>}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-2)' }}>{item.changed_by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No recent activity</div>
        )}
      </div>
    </div>
  )
}
