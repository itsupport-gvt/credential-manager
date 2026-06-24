import { useEffect, useState, type ChangeEvent } from 'react'
import { api } from '../lib/api'
import type { Tenant, Stats } from '../lib/types'
import { useToast } from '../App'

const STATUSES = ['Active', 'Inactive']

interface TForm {
  tenant_code: string; tenant_name: string; industry: string
  primary_contact: string; contact_email: string; contact_phone: string
  account_manager: string; contract_start: string; contract_end: string
  status: string; notes: string
}
const EMPTY: TForm = { tenant_code: '', tenant_name: '', industry: '', primary_contact: '', contact_email: '', contact_phone: '', account_manager: '', contract_start: '', contract_end: '', status: 'Active', notes: '' }

function TenantForm({ initial = EMPTY, onSubmit, onCancel, submitting, isEdit }: {
  initial?: TForm; onSubmit: (d: TForm) => Promise<void>; onCancel: () => void; submitting: boolean; isEdit?: boolean
}) {
  const [form, setForm] = useState<TForm>(initial)
  const ch = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  return (
    <form onSubmit={async e => { e.preventDefault(); await onSubmit(form) }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div>
          <label className="md-label">Tenant code *</label>
          <input className="md-input" style={{ opacity: isEdit ? .6 : 1 }} name="tenant_code" value={form.tenant_code} onChange={ch} required disabled={isEdit} placeholder="e.g. ACME" />
        </div>
        <div>
          <label className="md-label">Tenant name *</label>
          <input className="md-input" name="tenant_name" value={form.tenant_name} onChange={ch} required placeholder="Acme Corporation" />
        </div>
        <div>
          <label className="md-label">Industry</label>
          <input className="md-input" name="industry" value={form.industry} onChange={ch} />
        </div>
        <div>
          <label className="md-label">Primary contact</label>
          <input className="md-input" name="primary_contact" value={form.primary_contact} onChange={ch} />
        </div>
        <div>
          <label className="md-label">Contact email</label>
          <input className="md-input" type="email" name="contact_email" value={form.contact_email} onChange={ch} />
        </div>
        <div>
          <label className="md-label">Contact phone</label>
          <input className="md-input" type="tel" name="contact_phone" value={form.contact_phone} onChange={ch} />
        </div>
        <div>
          <label className="md-label">Account manager</label>
          <input className="md-input" name="account_manager" value={form.account_manager} onChange={ch} />
        </div>
        <div>
          <label className="md-label">Status</label>
          <select className="md-select" name="status" value={form.status} onChange={ch}>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="md-label">Contract start</label>
          <input className="md-input" type="date" name="contract_start" value={form.contract_start} onChange={ch} />
        </div>
        <div>
          <label className="md-label">Contract end</label>
          <input className="md-input" type="date" name="contract_end" value={form.contract_end} onChange={ch} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label className="md-label">Notes</label>
          <textarea className="md-textarea" name="notes" value={form.notes} onChange={ch} rows={2} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={submitting} className="md-btn md-btn-primary">
          {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Add tenant'}
        </button>
        <button type="button" onClick={onCancel} className="md-btn md-btn-text">Cancel</button>
      </div>
    </form>
  )
}

export default function TenantsPage() {
  const { showToast } = useToast()
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.listTenants(), api.getStats()])
      .then(([t, s]) => { setTenants(t); setStats(s) })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false))
  }, [])

  const credCount = (code: string) => stats?.by_tenant.find(t => t.code === code)?.count ?? 0

  async function handleAdd(data: TForm) {
    setSubmitting(true)
    try {
      const t = await api.createTenant(data); setTenants(p => [...p, t]); setShowAdd(false)
      showToast(`Tenant ${data.tenant_code} added`, 'success')
    } catch (e) { showToast(e instanceof Error ? e.message : 'Failed', 'error') }
    finally { setSubmitting(false) }
  }

  async function handleEdit(code: string, data: TForm) {
    setSubmitting(true)
    try {
      const t = await api.updateTenant(code, data)
      setTenants(p => p.map(x => x.tenant_code === code ? t : x)); setEditing(null)
      showToast('Tenant updated', 'success')
    } catch (e) { showToast(e instanceof Error ? e.message : 'Failed', 'error') }
    finally { setSubmitting(false) }
  }

  async function handleDelete(code: string) {
    if (!confirm(`Delete tenant "${code}"? This cannot be undone.`)) return
    setDeleting(code)
    try {
      await api.deleteTenant(code); setTenants(p => p.filter(t => t.tenant_code !== code))
      if (expanded === code) setExpanded(null)
      showToast(`Tenant ${code} deleted`, 'success')
    } catch (e) { showToast(e instanceof Error ? e.message : 'Failed to delete', 'error') }
    finally { setDeleting(null) }
  }

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ height: 28, width: 120, background: 'var(--surface-2)', borderRadius: 6 }} />
        <div style={{ height: 36, width: 120, background: 'var(--surface-2)', borderRadius: 18 }} />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{ height: 64, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, animation: 'pulse 1.5s infinite' }} />
      ))}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div className="page-title">Tenants</div>
          <div className="page-subtitle">{tenants.length} tenant{tenants.length !== 1 ? 's' : ''}</div>
        </div>
        <button className="md-btn md-btn-primary" onClick={() => { setShowAdd(true); setEditing(null) }}>
          <span className="icon icon-sm">add</span>Add tenant
        </button>
      </div>

      {error && (
        <div style={{
          background: 'var(--danger-bg)', color: 'var(--danger)',
          padding: '12px 16px', borderRadius: 8, fontSize: 14,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span className="icon icon-sm">error</span>{error}
        </div>
      )}

      {showAdd && (
        <div className="md-card animate-in" style={{ padding: '24px 28px' }}>
          <h2 className="section-title" style={{ marginBottom: 20 }}>New tenant</h2>
          <TenantForm onSubmit={handleAdd} onCancel={() => setShowAdd(false)} submitting={submitting} />
        </div>
      )}

      <div className="md-card" style={{ overflow: 'hidden', padding: 0 }}>
        {tenants.length === 0 ? (
          <div style={{ padding: '64px 0', textAlign: 'center' }}>
            <span className="icon icon-xl" style={{ color: 'var(--text-3)', display: 'block', marginBottom: 12 }}>business</span>
            <div style={{ color: 'var(--text-2)', fontSize: 14 }}>No tenants yet</div>
          </div>
        ) : tenants.map((t, i) => (
          <div key={t.tenant_code} style={{ borderBottom: i < tenants.length - 1 ? '1px solid var(--border)' : 'none' }}>

            <div
              className="md-row"
              style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px' }}
              onClick={() => { setExpanded(e => e === t.tenant_code ? null : t.tenant_code); setEditing(null) }}
            >
              <span className="icon" style={{ color: 'var(--text-3)' }}>business</span>
              <div style={{ width: 90, flexShrink: 0 }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 500, fontSize: 13, color: 'var(--text-2)' }}>{t.tenant_code}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.tenant_name}</div>
                {t.industry && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{t.industry}</div>}
              </div>
              <span className={t.status === 'Active' ? 'badge-active' : 'badge-neutral'}>{t.status}</span>
              <div style={{ flexShrink: 0, fontSize: 13, color: 'var(--text-2)', textAlign: 'right', minWidth: 80 }}>
                <span style={{ fontWeight: 500, color: 'var(--text-1)' }}>{credCount(t.tenant_code)}</span> credentials
              </div>
              <span className="icon icon-sm" style={{ color: 'var(--text-3)' }}>{expanded === t.tenant_code ? 'expand_less' : 'expand_more'}</span>
            </div>

            {expanded === t.tenant_code && (
              <div style={{ padding: '20px 24px', background: 'var(--surface-2)', borderTop: '1px solid var(--border)' }}>
                {editing === t.tenant_code ? (
                  <TenantForm
                    initial={{
                      tenant_code: t.tenant_code, tenant_name: t.tenant_name, industry: t.industry,
                      primary_contact: t.primary_contact, contact_email: t.contact_email, contact_phone: t.contact_phone,
                      account_manager: t.account_manager, contract_start: t.contract_start, contract_end: t.contract_end,
                      status: t.status, notes: t.notes,
                    }}
                    onSubmit={d => handleEdit(t.tenant_code, d)}
                    onCancel={() => setEditing(null)}
                    submitting={submitting}
                    isEdit
                  />
                ) : (
                  <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 20, marginBottom: 20 }}>
                      {[
                        ['Tenant ID', t.tenant_id],
                        ['Industry', t.industry],
                        ['Contact email', t.contact_email],
                        ['Contact phone', t.contact_phone],
                        ['Account manager', t.account_manager],
                        ['Contract start', t.contract_start],
                        ['Contract end', t.contract_end],
                        ['Status', t.status],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 4 }}>{label}</div>
                          <div style={{ fontSize: 14, color: 'var(--text-1)' }}>{value || '—'}</div>
                        </div>
                      ))}
                    </div>
                    {t.notes && (
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: .5, marginBottom: 4 }}>Notes</div>
                        <div style={{ fontSize: 14, color: 'var(--text-1)' }}>{t.notes}</div>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="md-btn md-btn-tonal md-btn-sm" onClick={() => setEditing(t.tenant_code)}>
                        <span className="icon icon-sm">edit</span>Edit
                      </button>
                      <button className="md-btn md-btn-danger md-btn-sm" onClick={() => handleDelete(t.tenant_code)} disabled={deleting === t.tenant_code}>
                        <span className="icon icon-sm">delete</span>{deleting === t.tenant_code ? 'Deleting…' : 'Delete'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
