import { useEffect, useState, useCallback, useRef, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { Credential, CredentialsPage as CPData, Tenant, Category } from '../lib/types'
import { StatusBadge } from '../components/StatusBadge'
import { PriorityBadge } from '../components/PriorityBadge'

const PAGE_SIZE = 50
const STATUSES = ['Active', 'Inactive', 'Expired', 'Compromised', 'Archived']
const PRIORITIES = ['Critical', 'High', 'Medium', 'Low']

const sel: React.CSSProperties = {
  padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13,
  background: 'var(--surface)', color: 'var(--text-1)', outline: 'none', cursor: 'pointer',
}

function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  async function handle(e: MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    await navigator.clipboard.writeText(value)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={handle} title="Copy" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: copied ? 'var(--success)' : 'var(--text-3)', opacity: 0, transition: 'opacity .15s' }}
      className="copy-btn">
      <span className="icon icon-sm">{copied ? 'check' : 'content_copy'}</span>
    </button>
  )
}

function fmtDate(d: string) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString() } catch { return d }
}

export default function CredentialsPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<CPData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  const [query, setQuery] = useState('')
  const [dq, setDq] = useState('')
  const [filterTenant, setFilterTenant] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [page, setPage] = useState(1)
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    debRef.current && clearTimeout(debRef.current)
    debRef.current = setTimeout(() => { setDq(query); setPage(1) }, 300)
    return () => { debRef.current && clearTimeout(debRef.current) }
  }, [query])

  useEffect(() => {
    api.listTenants().then(setTenants).catch(() => {})
    api.listCategories().then(setCategories).catch(() => {})
  }, [])

  const fetch = useCallback(() => {
    setLoading(true); setError(null)
    api.listCredentials({ q: dq || undefined, tenant: filterTenant || undefined, category: filterCategory || undefined, status: filterStatus || undefined, priority: filterPriority || undefined, page, page_size: PAGE_SIZE })
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false))
  }, [dq, filterTenant, filterCategory, filterStatus, filterPriority, page])

  useEffect(() => { fetch() }, [fetch])

  const totalPages = data?.pages ?? 1

  const isExpired = (d: string) => d && new Date(d) < new Date()
  const isExpiringSoon = (d: string) => { if (!d) return false; const diff = new Date(d).getTime() - Date.now(); return diff > 0 && diff < 30 * 86400_000 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="page-title">Credentials</div>
          {data && <div className="page-subtitle">{data.total} credential{data.total !== 1 ? 's' : ''}</div>}
        </div>
        <button className="md-btn md-btn-primary" onClick={() => navigate('/credential/new')}>
          <span className="icon icon-sm">add</span>New Credential
        </button>
      </div>

      {/* Filters */}
      <div className="md-card-flat" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 10 }}>
          <div style={{ position: 'relative' }}>
            <span className="icon icon-sm" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)' }}>search</span>
            <input
              type="text"
              placeholder="Search service, tenant, username…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{ ...sel, paddingLeft: 34, width: '100%' }}
            />
          </div>
          <select value={filterTenant} onChange={e => { setFilterTenant(e.target.value); setPage(1) }} style={sel}>
            <option value="">All Tenants</option>
            {tenants.map(t => <option key={t.tenant_code} value={t.tenant_code}>{t.tenant_name}</option>)}
          </select>
          <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(1) }} style={sel}>
            <option value="">All Categories</option>
            {categories.map(c => <option key={c.category_id} value={c.category_name}>{c.category_name}</option>)}
          </select>
          <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }} style={sel}>
            <option value="">All Statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterPriority} onChange={e => { setFilterPriority(e.target.value); setPage(1) }} style={sel}>
            <option value="">All Priorities</option>
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
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
                {['ID', 'Service', 'Tenant', 'Category', 'Username', 'Status', 'Priority', 'Expiry', 'MFA'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 11, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: .5, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} style={{ padding: '12px 14px' }}>
                        <div style={{ height: 14, background: 'var(--surface-2)', borderRadius: 4, animation: 'pulse 1.5s infinite' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data && data.items.length > 0 ? (
                data.items.map((c: Credential) => (
                  <tr key={c.id} className="md-row" style={{ borderTop: '1px solid var(--border)' }}
                    onClick={() => navigate(`/credential/${c.credential_id}`)}>
                    <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-3)' }}>{c.credential_id}</td>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-1)' }}>{c.service_name}</div>
                      {c.environment && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.environment}</div>}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ fontWeight: 500, color: 'var(--text-1)' }}>{c.tenant_code}</div>
                      {c.tenant_name && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.tenant_name}</div>}
                    </td>
                    <td style={{ padding: '11px 14px', color: 'var(--text-2)' }}>
                      {c.category}
                      {c.subcategory && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.subcategory}</div>}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', maxWidth: 180 }}
                        onMouseEnter={e => { const b = e.currentTarget.querySelector<HTMLElement>('.copy-btn'); if (b) b.style.opacity = '1' }}
                        onMouseLeave={e => { const b = e.currentTarget.querySelector<HTMLElement>('.copy-btn'); if (b) b.style.opacity = '0' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-1)' }}>{c.username_email || '—'}</span>
                        {c.username_email && <CopyBtn value={c.username_email} />}
                      </div>
                    </td>
                    <td style={{ padding: '11px 14px' }}><StatusBadge status={c.status} /></td>
                    <td style={{ padding: '11px 14px' }}><PriorityBadge priority={c.priority} /></td>
                    <td style={{ padding: '11px 14px' }}>
                      {c.password_expiry_date ? (
                        <span style={{ color: isExpired(c.password_expiry_date) ? 'var(--danger)' : isExpiringSoon(c.password_expiry_date) ? 'var(--warn)' : 'var(--text-2)', fontWeight: (isExpired(c.password_expiry_date) || isExpiringSoon(c.password_expiry_date)) ? 600 : 400 }}>
                          {fmtDate(c.password_expiry_date)}
                        </span>
                      ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      {c.mfa_enabled === 'Yes'
                        ? <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 500 }}><span className="icon icon-sm">verified</span>Yes</span>
                        : <span style={{ color: 'var(--text-3)', fontSize: 12 }}>No</span>}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-3)' }}>
                    <span className="icon" style={{ fontSize: 40, display: 'block', marginBottom: 10, opacity: .3 }}>lock</span>
                    <div style={{ fontSize: 14 }}>No credentials found</div>
                    {(query || filterTenant || filterCategory || filterStatus || filterPriority) && (
                      <button onClick={() => { setQuery(''); setFilterTenant(''); setFilterCategory(''); setFilterStatus(''); setFilterPriority(''); setPage(1) }}
                        style={{ marginTop: 10, background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 13 }}>
                        Clear filters
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>Page {page} of {totalPages} · {data.total} total</div>
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
