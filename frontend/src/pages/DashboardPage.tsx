import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { Stats } from '../lib/types'

// ── Small typed presentational helpers ──────────────────────────────────────

function KpiCard({ icon, label, value, onClick }: {
  icon: string; label: string; value: number | string; onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className="md-card"
      style={{
        padding: '20px 22px',
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: 'var(--primary-bg)', color: 'var(--primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span className="icon icon-sm">{icon}</span>
      </div>
      <div>
        <div style={{
          fontFamily: "'Google Sans', sans-serif",
          fontSize: 28, fontWeight: 400, color: 'var(--text-1)',
          lineHeight: 1.1, letterSpacing: -.5,
        }}>{value}</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>{label}</div>
      </div>
    </div>
  )
}

function AlertRow({ icon, label, value, tone }: {
  icon: string; label: string; value: number; tone: 'warn' | 'danger'
}) {
  const color = tone === 'danger' ? 'var(--danger)' : 'var(--warn)'
  const bg    = tone === 'danger' ? 'var(--danger-bg)' : 'var(--warn-bg)'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 18px',
      border: '1px solid var(--border)', borderRadius: 12,
      background: 'var(--surface)',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: bg, color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <span className="icon icon-sm">{icon}</span>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, color: 'var(--text-1)', fontWeight: 500 }}>{label}</div>
      </div>
      <div style={{
        fontFamily: "'Google Sans', sans-serif",
        fontSize: 20, fontWeight: 500, color,
      }}>{value}</div>
    </div>
  )
}

function Section({ title, action, children }: {
  title: string; action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <section className="md-card" style={{ padding: '20px 24px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <h2 className="section-title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function DataRow({ label, count, total }: {
  label: string; count: number; total: number
}) {
  const pct = total > 0 ? Math.min(100, (count / total) * 100) : 0
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '10px 0',
    }}>
      <div style={{ flex: 1, fontSize: 14, color: 'var(--text-1)' }}>{label}</div>
      <div style={{
        width: 140, height: 4, borderRadius: 2,
        background: 'var(--surface-3)', overflow: 'hidden', flexShrink: 0,
      }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: 'var(--primary)', borderRadius: 2,
          transition: 'width .4s ease',
        }} />
      </div>
      <div style={{
        width: 40, textAlign: 'right',
        fontSize: 14, color: 'var(--text-2)',
        fontVariantNumeric: 'tabular-nums',
      }}>{count}</div>
    </div>
  )
}

function actionBadgeClass(action: string) {
  if (action === 'CREATE') return 'badge-active'
  if (action === 'DELETE' || action === 'ARCHIVE') return 'badge-danger'
  if (action === 'REVEAL' || action === 'ACCESS')  return 'badge-purple'
  return 'badge-blue'
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    api.getStats()
      .then(setStats)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="md-card" style={{ height: 130, animation: 'pulse 1.5s infinite' }} />
      ))}
    </div>
  )

  if (error) return (
    <div style={{
      padding: '12px 16px', borderRadius: 8,
      background: 'var(--danger-bg)', color: 'var(--danger)',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span className="icon icon-sm">error</span>{error}
    </div>
  )

  if (!stats) return null

  const active   = stats.by_status['Active']   ?? 0
  const critical = stats.by_priority['Critical'] ?? 0

  const catData    = [...stats.by_category].sort((a, b) => b.count - a.count).slice(0, 6)
  const tenantData = [...stats.by_tenant].sort((a, b) => b.count - a.count).slice(0, 6)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-subtitle">Overview of credentials, activity, and sync status</div>
        </div>
        {stats.pending_sync > 0 && (
          <div className="md-chip" style={{ color: 'var(--warn)', background: 'var(--warn-bg)', border: 'none' }}>
            <span className="icon icon-sm">sync</span>
            {stats.pending_sync} pending sync
          </div>
        )}
      </div>

      {/* ── KPI grid ────────────────────────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 16,
      }}>
        <KpiCard icon="password"     label="Total credentials" value={stats.total_credentials} onClick={() => navigate('/credentials')} />
        <KpiCard icon="check_circle" label="Active"            value={active} />
        <KpiCard icon="priority_high" label="Critical priority" value={critical} />
        <KpiCard icon="schedule"     label="Expiring in 90 days" value={stats.expiring_90d} />
      </div>

      {/* ── Alerts (only if present) ───────────────────────────────── */}
      {(stats.expiring_30d > 0 || stats.no_mfa > 0) && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
        }}>
          {stats.expiring_30d > 0 && (
            <AlertRow icon="schedule" label="Expiring within 30 days" value={stats.expiring_30d} tone="danger" />
          )}
          {stats.no_mfa > 0 && (
            <AlertRow icon="gpp_maybe" label="Without multi-factor authentication" value={stats.no_mfa} tone="warn" />
          )}
        </div>
      )}

      {/* ── Categories + Tenants ───────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
        <Section title="Top categories">
          {catData.length > 0
            ? catData.map((c, i) => (
                <DataRow key={i} label={c.name} count={c.count} total={stats.total_credentials} />
              ))
            : <EmptyText>No categories yet</EmptyText>}
        </Section>

        <Section title="Top tenants">
          {tenantData.length > 0
            ? tenantData.map((t, i) => (
                <DataRow key={i} label={t.name || t.code} count={t.count} total={stats.total_credentials} />
              ))
            : <EmptyText>No tenants yet</EmptyText>}
        </Section>
      </div>

      {/* ── Status & Priority ──────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
        <Section title="Status">
          {Object.entries(stats.by_status).sort((a, b) => b[1] - a[1]).map(([s, c]) => (
            <DataRow key={s} label={s} count={c} total={stats.total_credentials} />
          ))}
        </Section>
        <Section title="Priority">
          {Object.entries(stats.by_priority).sort((a, b) => b[1] - a[1]).map(([p, c]) => (
            <DataRow key={p} label={p} count={c} total={stats.total_credentials} />
          ))}
        </Section>
      </div>

      {/* ── Recent activity ────────────────────────────────────────── */}
      <Section
        title="Recent activity"
        action={
          <button className="md-btn md-btn-text md-btn-sm" onClick={() => navigate('/changelog')}>
            View all
            <span className="icon icon-sm">arrow_forward</span>
          </button>
        }
      >
        {stats.recent_log.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Time', 'Service', 'Action', 'User'].map(h => (
                  <th key={h} style={{
                    textAlign: 'left', padding: '8px 12px',
                    fontSize: 11, fontWeight: 500, color: 'var(--text-2)',
                    textTransform: 'uppercase', letterSpacing: .5,
                    borderBottom: '1px solid var(--border)',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.recent_log.slice(0, 8).map(item => (
                <tr
                  key={item.id}
                  className="md-row"
                  onClick={() => navigate(`/credential/${item.credential_id}`)}
                  style={{ borderBottom: '1px solid var(--border)' }}
                >
                  <td style={{ padding: '12px', whiteSpace: 'nowrap', color: 'var(--text-2)' }}>
                    {new Date(item.timestamp).toLocaleDateString()}
                    <span style={{ marginLeft: 8, color: 'var(--text-3)', fontSize: 12 }}>
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ color: 'var(--text-1)', fontWeight: 500 }}>{item.service_name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'monospace', marginTop: 2 }}>
                      {item.credential_id}
                    </div>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span className={actionBadgeClass(item.action)}>{item.action}</span>
                    {item.field_changed && (
                      <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-3)' }}>{item.field_changed}</span>
                    )}
                  </td>
                  <td style={{ padding: '12px', color: 'var(--text-2)' }}>{item.changed_by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyText icon="history">No recent activity</EmptyText>
        )}
      </Section>
    </div>
  )
}

function EmptyText({ icon, children }: { icon?: string; children: React.ReactNode }) {
  return (
    <div style={{
      textAlign: 'center', padding: '32px 0',
      color: 'var(--text-3)', fontSize: 14,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
    }}>
      {icon && <span className="icon icon-lg" style={{ opacity: .5 }}>{icon}</span>}
      {children}
    </div>
  )
}
