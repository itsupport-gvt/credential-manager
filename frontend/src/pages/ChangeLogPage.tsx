import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { ChangeLogItem, Tenant } from '../lib/types'

const PAGE_SIZE = 50
const ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'ARCHIVE', 'REVEAL', 'ACCESS']

const sel: React.CSSProperties = {
  padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13,
  background: 'var(--surface)', color: 'var(--text-1)', outline: 'none', cursor: 'pointer',
}

function actionBadge(action: string) {
  if (action === 'CREATE') return 'badge-active'
  if (action === 'DELETE' || action === 'ARCHIVE') return 'badge-danger'
  if (action === 'REVEAL' || action === 'ACCESS') return 'badge-purple'
  return 'badge-blue'
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
  const [dq, setDq] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterTenant, setFilterTenant] = useState('')
  const [page, setPage] = useState(1)
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    debRef.current && clearTimeout(debRef.current)
    debRef.current = setTimeout(() => { setDq(query); setPage(1) }, 300)
    return () => { debRef.current && clearTimeout(debRef.current) }
  }, [query])

  useEffect(() => { api.listTenants().then(setTenants).catch(() => {}) }, [])

  const fetch = useCallback(() => {
    setLoading(true); setError(null)
    api.getChangeLog({ q: dq || undefined, tenant: filterTenant || undefined, action: filterAction || undefined, page, page_size: PAGE_SIZE })
      .then(d => { setItems(d.items); setTotal(d.total); setTotalPages(d.pages) })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false))
  }, [dq, filterTenant, filterAction, page])

  useEffect(() => { fetch() }, [fetch])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="page-title">Activity Log</div>
          <div className="page-subtitle">{total} log entries</div>
        </div>
        <a href={api.exportChangeLogUrl()} download className="md-btn md-btn-outlined" style={{ textDecoration: 'none' }}>
          <span className="icon icon-sm">download</span>Export CSV
        </a>
      </div>

      {/* Filters */}
      <div className="md-card-flat" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <span className="icon icon-sm" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}>search</span>
            <input type="text" placeholder="Search log entries…" value={query} onChange={e => setQuery(e.target.value)} style={{ ...sel, paddingLeft: 34, width: '100%' }} />
          </div>
          <select value={filterAction} onChange={e => { setFilterAction(e.target.value); setPage(1) }} style={sel}>
            <option value="">All Actions</option>
            {ACTIONS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={filterTenant} onChange={e => { setFilterTenant(e.target.value); setPage(1) }} style={sel}>
            <option value="">All Tenants</option>
            {tenants.map(t => <option key={t.tenant_code} value={t.tenant_code}>{t.tenant_name}</option>)}
          </select>
        </div>
      </div>

      {error && <div style={{ background: 'var(--danger-bg)', border: '1px solid #f5c6c3', color: 'var(--danger)', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>{error}</div>}

      {/* Table */}
      <div className="md-card" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                {['Log ID', 'Timestamp', 'Credential', 'Service', 'Tenant', 'Action', 'Field Changed', 'Changed By'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: .5, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} style={{ padding: '12px 14px' }}>
                        <div style={{ height: 13, background: 'var(--surface-2)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : items.length > 0 ? (
                items.map(item => (
                  <tr key={item.id} className="md-row" style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-3)' }}>{item.log_id}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{new Date(item.timestamp).toLocaleString()}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <button onClick={() => navigate(`/credential/${item.credential_id}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontFamily: 'monospace', fontSize: 11, padding: 0, textDecoration: 'underline dotted' }}>
                        {item.credential_id}
                      </button>
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-1)', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.service_name}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-2)', fontSize: 12 }}>{item.tenant_code}</td>
                    <td style={{ padding: '10px 14px' }}><span className={actionBadge(item.action)}>{item.action}</span></td>
                    <td style={{ padding: '10px 14px' }}>
                      {item.field_changed && (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)' }}>{item.field_changed}</div>
                          {(item.old_value_masked || item.new_value_masked) && (
                            <div style={{ fontFamily: 'monospace', fontSize: 11, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                              {item.old_value_masked && <span style={{ color: 'var(--danger)' }}>{item.old_value_masked}</span>}
                              {item.old_value_masked && item.new_value_masked && <span style={{ color: 'var(--text-3)' }}>→</span>}
                              {item.new_value_masked && <span style={{ color: 'var(--success)' }}>{item.new_value_masked}</span>}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 14px', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
                      <div>{item.changed_by}</div>
                      {item.reason && <div style={{ fontSize: 11, color: 'var(--text-3)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.reason}</div>}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 14 }}>
                    <span className="icon" style={{ fontSize: 40, display: 'block', marginBottom: 10, opacity: .3 }}>history</span>
                    No log entries found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Page {page} of {totalPages} · {total} total</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="md-btn md-btn-outlined" style={{ padding: '5px 14px', fontSize: 13 }}>Previous</button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="md-btn md-btn-outlined" style={{ padding: '5px 14px', fontSize: 13 }}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
